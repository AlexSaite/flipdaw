// FlipDAW JUCE core spike (M5) — VST3 host + JSON-lines IPC.
//
// Deliberately small: it exists to answer three M5 questions
//  1. can a VST3 be loaded & hosted in-process on this laptop?
//  2. is JSON-lines-over-socket jitter ≤ 1 ms for control messaging?
//  3. can a grid launch stay quantized via the beat clock?
//
// SPIKE ONLY: no installer, no error hardening, compile-then-trim.
// Built with JUCE 7 headers (find via -Ijuce_7/modules).

#include <cstdint>
#include <memory>
#include <optional>

#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_core/juce_core.h>

static constexpr int kMinBufferMs = 128; // ~2.6 ms at 48 kHz

// ---- IPC: one JSON line per socket message -------------------------------

class LineServer {
public:
  bool listenPort(int port) { return listener_.bind(port); }

  bool accept() {
    conn_ = listener_.waitForNextConnection();
    return conn_ != nullptr;
  }

  // Pulls one complete line (JSON objects never contain raw newlines).
  std::optional<juce::String> nextLine(int timeoutMs) {
    char chunk[512];
    const int n = conn_->waitUntilReady(true, timeoutMs) && conn_->isConnected()
      ? conn_->read(chunk, sizeof chunk, false)
      : -1;
    if (n <= 0) return std::nullopt;
    buf_ += juce::String::fromUTF8(chunk, n);
    const int nl = buf_.indexOfChar('\n');
    if (nl < 0) return std::nullopt;
    const juce::String line = buf_.substring(0, nl);
    buf_ = buf_.substring(nl + 1);
    return line;
  }

  void send(const juce::var& obj) {
    const juce::String line = juce::JSON::toString(obj) + "\n";
    conn_->write(line.toRawUTF8(), line.getNumBytes());
  }

private:
  juce::StreamingSocket listener_;
  juce::StreamingSocket* conn_ = nullptr;
  juce::String buf_;
};

// ---- beat clock: transport owns musical time (ADR-002 style) --------------

class BeatClock {
public:
  void start() { playing_ = true; }
  void stop() { playing_ = false; }
  void setBpm(double bpm) { bpm_ = bpm; }
  bool playing() const { return playing_; }
  double beatsAt(uint64_t frames, double sampleRate) const {
    return static_cast<double>(frames) / sampleRate * (bpm_ / 60.0);
  }

private:
  std::atomic<double> bpm_{120.0};
  std::atomic<bool> playing_{false};
};

// ---- host: load ONE VST3 and run it on the default output device ----------

class Vst3Host final : public juce::AudioProcessor::Listener,
                       public juce::AudioIODeviceCallback {
public:
  bool load(const juce::File& plugin) {
    juce::OwnedArray<juce::PluginDescription> descs;
    format_.getAllTypes(descs);
    for (auto* d : descs) {
      if (d->filePath != plugin.getFullPathName()) continue;
      proc_ = format_.loadPluginFor(*d, kMinBufferMs, 48000, 512, nullptr);
      if (proc_ == nullptr) return false;
      proc_->addListener(this);
      return true;
    }
    return false;
  }

  BeatClock& clock() { return clock_; }

  void audioDeviceAboutToStart(juce::AudioIODevice* device) override {
    if (proc_ != nullptr) {
      proc_->prepareToPlay(device->getCurrentSampleRate(), device->getCurrentBufferSizeSamples());
      clock_.start();
    }
  }

  void audioDeviceStopped() override {
    if (proc_ != nullptr) proc_->releaseResources();
  }

  void audioDeviceIOCallback(const float**, int /*ins*/, float** out, int /*outs*/, int frames) override {
    if (proc_ == nullptr) return;
    const int chans = proc_->getTotalNumOutputChannels();
    juce::AudioBuffer<float> temp(proc_->getTotalNumInputChannels(), frames);
    temp.clear();
    juce::MidiBuffer midi;
    proc_->processBlock(temp, midi);
    for (int ch = 0; ch < chans && ch < 2; ++ch) {
      juce::FloatVectorOperations::copy(out[ch], temp.getReadPointer(ch), frames);
    }
  }

  void audioProcessorParameterChanged(juce::AudioProcessor*, int, float) override {}
  void audioProcessorChanged(juce::AudioProcessor*, const juce::ChangeDetails&) override {}
  void audioProcessorParameterChangeGestureBegin(juce::AudioProcessor*, int) override {}
  void audioProcessorParameterChangeGestureEnd(juce::AudioProcessor*, int) override {}

private:
  juce::VST3PluginFormat format_;
  std::unique_ptr<juce::AudioPluginInstance> proc_;
  BeatClock clock_;
};

// ---- main: wire JSON-lines to commands ------------------------------------

static void sendLine(LineServer& server, const juce::String& t,
                     const juce::var& peerSeq, const juce::var& msg = {}) {
  juce::DynamicObject obj;
  obj.setProperty("t", t);
  obj.setProperty("seq", peerSeq);
  if (msg.isObject()) obj.setProperty("message", msg);
  server.send(juce::var(&obj));
}

int main(int argc, char** argv) {
  if (argc < 3) {
    juce::Logger::outputDebugString("usage: juce-core <vst3-path> <port>");
    return 2;
  }
  const juce::String portStr(argv[2]);

  Vst3Host host;
  if (!host.load(juce::File(argv[1]))) return 3;

  // Device manager attaches the host callback once per block.
  juce::AudioDeviceManager deviceManager;
  deviceManager.addAudioCallback(&host);
  deviceManager.initialiseWithDefaultDevices(0, 2);

  LineServer server;
  if (!server.listenPort(portStr.getIntValue())) return 4;
  if (!server.accept()) return 5;

  const juce::StringArray handled({ "transport.start", "transport.stop",
                                    "transport.panic", "transport.bpm", "cell.launch" });
  for (;;) {
    const auto line = server.nextLine(100);
    if (!line) continue;
    const juce::var obj = juce::JSON::parse(*line);
    if (!obj.isObject()) continue; // stream noise → drop, never crash

    const juce::String t = obj.getProperty("t", "");
    const juce::var peerSeq = obj.getProperty("seq", -1);
    if (t == "hello") {
      juce::DynamicObject hello;
      hello.setProperty("t", "hello");
      hello.setProperty("v", 1);
      hello.setProperty("seq", peerSeq);
      server.send(juce::var(&hello));
    } else if (t == "ping") {
      sendLine(server, "pong", peerSeq);
    } else if (t == "transport.bpm") {
      host.clock().setBpm(obj.getProperty("bpm", 120.0));
      sendLine(server, "ack", peerSeq);
    } else if (handled.contains(t)) {
      // transport.start/stop/panic, cell.launch → clock + clip state in full impl
      sendLine(server, "ack", peerSeq);
    } else {
      sendLine(server, "error", peerSeq, juce::var("unknown command"));
    }
  }
}