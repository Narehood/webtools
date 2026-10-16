import { useEffect, useRef, useState } from "react";
import { ToolFrame, saveFile } from "../../../components/Utility";
import { CopyButton } from "../../../components/CopyButton";

function DeviceInfo() {
  const read = () =>
    JSON.stringify(
      {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        languages: navigator.languages,
        language: navigator.language,
        online: navigator.onLine,
        cookiesEnabled: navigator.cookieEnabled,
        cpuThreads: navigator.hardwareConcurrency,
        maxTouchPoints: navigator.maxTouchPoints,
        secureContext: window.isSecureContext,
        screen: {
          width: screen.width,
          height: screen.height,
          availableWidth: screen.availWidth,
          availableHeight: screen.availHeight,
          colorDepth: screen.colorDepth,
          pixelDepth: screen.pixelDepth,
        },
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        colorScheme: matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      },
      null,
      2,
    );
  const [info, setInfo] = useState(read);
  return (
    <ToolFrame
      slug="device"
      note="Values exposed by this browser. Some are approximate, reduced, or spoofable. This report stays in the tab."
    >
      <section className="panel stack">
        <label className="field">
          <span>Device report</span>
          <textarea className="utility-output" readOnly value={info} />
        </label>
        <div className="row">
          <button className="btn" onClick={() => setInfo(read())}>
            Refresh
          </button>
          <CopyButton text={info} />
          <button
            className="btn ghost"
            onClick={() => saveFile(info, "device.json", "application/json")}
          >
            Download JSON
          </button>
        </div>
      </section>
    </ToolFrame>
  );
}
function KeyboardInfo() {
  const [info, setInfo] = useState("");
  return (
    <ToolFrame
      slug="keycode"
      note="Focus the test area and press a key. Tab moves focus normally; system shortcuts may be intercepted by your browser or OS."
    >
      <section className="panel stack">
        <div
          role="group"
          aria-label="Keyboard test area"
          tabIndex={0}
          className="keyboard-test"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "Tab") event.preventDefault();
            setInfo(
              JSON.stringify(
                {
                  key: event.key,
                  code: event.code,
                  location: event.location,
                  repeat: event.repeat,
                  alt: event.altKey,
                  control: event.ctrlKey,
                  shift: event.shiftKey,
                  meta: event.metaKey,
                  composing: event.nativeEvent.isComposing,
                  legacyKeyCode: event.keyCode,
                },
                null,
                2,
              ),
            );
          }}
        >
          Click here or focus with Tab, then press a key
        </div>
        <label className="field">
          <span>Key event</span>
          <textarea readOnly value={info} />
        </label>
        <CopyButton text={info} />
      </section>
    </ToolFrame>
  );
}
function CameraRecorder() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [opening, setOpening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState(false);
  const [facing, setFacing] = useState("user");
  const [clip, setClip] = useState<{
    url: string;
    blob: Blob;
    name: string;
  } | null>(null);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null),
    recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined),
    mounted = useRef(true),
    request = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
      window.clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  useEffect(
    () => () => {
      if (clip) URL.revokeObjectURL(clip.url);
    },
    [clip],
  );
  async function open() {
    setError("");
    setOpening(true);
    const id = ++request.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera access requires HTTPS or localhost and browser support.",
        );
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio,
      });
      if (!mounted.current || id !== request.current) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = next;
      setStream(next);
    } catch (err) {
      if (mounted.current)
        setError(
          err instanceof Error ? err.message : "Camera could not be opened.",
        );
    } finally {
      if (mounted.current) setOpening(false);
    }
  }
  function stopRecording() {
    window.clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  function close() {
    request.current++;
    stopRecording();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }
  async function photo() {
    try {
      const target = video.current;
      if (!target?.videoWidth) throw new Error("Wait for the camera image.");
      const canvas = document.createElement("canvas");
      canvas.width = target.videoWidth;
      canvas.height = target.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable.");
      context.drawImage(target, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Photo could not be encoded.")),
          "image/png",
        ),
      );
      saveFile(blob, "camera-photo.png", "image/png");
    } catch (err) {
      setError(String(err));
    }
  }
  function record() {
    try {
      if (!streamRef.current || typeof MediaRecorder === "undefined")
        throw new Error("Recording is not supported by this browser.");
      const mime = [
        "video/webm;codecs=vp9,opus",
        "video/webm",
        "video/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const next = new MediaRecorder(
        streamRef.current,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = next;
      const chunks: BlobPart[] = [];
      let size = 0;
      next.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          size += event.data.size;
        }
        if (size >= 100 * 1024 * 1024 && next.state === "recording")
          next.stop();
      };
      next.onerror = () => {
        if (mounted.current) setError("Video recording failed.");
        stopRecording();
      };
      next.onstop = () => {
        window.clearTimeout(timer.current);
        if (!mounted.current) return;
        const blob = new Blob(chunks, { type: next.mimeType || "video/webm" });
        setClip({
          url: URL.createObjectURL(blob),
          blob,
          name: next.mimeType.includes("mp4")
            ? "camera-video.mp4"
            : "camera-video.webm",
        });
        setRecording(false);
      };
      setError("");
      setClip(null);
      next.start(1000);
      setRecording(true);
      timer.current = window.setTimeout(stopRecording, 120000);
    } catch (err) {
      setError(String(err));
    }
  }
  return (
    <ToolFrame
      slug="camera"
      note="Enable the camera to take PNG photos or record a video. Camera and microphone permission is requested only when you enable them. Recordings stop at two minutes or approximately 100 MiB and remain in this tab."
    >
      <div className="panel stack">
        <fieldset
          disabled={!!stream || opening}
          className="stack utility-fields"
        >
          <label className="field">
            <span>Camera</span>
            <select
              value={facing}
              onChange={(event) => setFacing(event.target.value)}
            >
              <option value="user">Front / webcam</option>
              <option value="environment">Rear</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={audio}
              onChange={(event) => setAudio(event.target.checked)}
            />
            Include microphone audio
          </label>
        </fieldset>
        <div className="row">
          <button
            className="btn"
            disabled={opening || !!stream}
            onClick={() => void open()}
          >
            {opening ? "Opening…" : "Enable camera"}
          </button>
          <button className="btn ghost" disabled={!stream} onClick={close}>
            Disable camera
          </button>
          <button
            className="btn ghost"
            disabled={!stream || recording}
            onClick={() => void photo()}
          >
            Take photo
          </button>
          {recording ? (
            <button className="btn" onClick={stopRecording}>
              Stop recording
            </button>
          ) : (
            <button className="btn ghost" disabled={!stream} onClick={record}>
              Record video
            </button>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
        {recording && <p role="status">Recording…</p>}
        <video
          className="camera-video"
          ref={video}
          autoPlay
          playsInline
          muted
          aria-label="Live camera preview"
        />
        {clip && (
          <>
            <h2>Recording</h2>
            <video className="camera-video" controls src={clip.url} />
            <div>
              <button
                className="btn"
                onClick={() => saveFile(clip.blob, clip.name, clip.blob.type)}
              >
                Download recording
              </button>
            </div>
          </>
        )}
      </div>
    </ToolFrame>
  );
}
export default function BrowserWorkbench({ slug }: { slug: string }) {
  if (slug === "device") return <DeviceInfo />;
  if (slug === "keycode") return <KeyboardInfo />;
  return <CameraRecorder />;
}
