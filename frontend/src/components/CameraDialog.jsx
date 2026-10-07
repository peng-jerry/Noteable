import { useCallback, useEffect, useRef, useState } from "react";
import { attachmentsApi } from "../api";
import { fitWithin, prepareImage } from "../utils/images";
import Dialog from "./Dialog";
import Icon from "./Icon";
import Spinner from "./Spinner";

const CAMERA_ERRORS = {
  NotAllowedError: "Camera access was blocked. Allow it in your browser's site settings, or choose an image instead.",
  SecurityError: "Camera access was blocked. Allow it in your browser's site settings, or choose an image instead.",
  NotFoundError: "No camera was found on this device. You can choose an image instead.",
  OverconstrainedError: "No camera was found on this device. You can choose an image instead.",
  NotReadableError: "The camera is being used by another app. Close it and try again, or choose an image.",
};

/**
 * Take a photo with the device camera (live preview, retake, switch camera)
 * or choose an existing image, then upload it. `onUploaded(attachment)` follows.
 */
export default function CameraDialog({ open, noteId, onClose, onUploaded }) {
  return (
    <Dialog open={open} title="Add a picture" onClose={onClose} size="md">
      {open && <Camera noteId={noteId} onClose={onClose} onUploaded={onUploaded} />}
    </Dialog>
  );
}

function Camera({ noteId, onClose, onUploaded }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [phase, setPhase] = useState("starting"); // starting | live | captured | error | uploading
  const [error, setError] = useState("");
  const [facing, setFacing] = useState("environment");
  const [cameras, setCameras] = useState(0);
  const [photo, setPhoto] = useState(null); // { blob, url, width, height, kind }

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (mode) => {
      stop();
      setPhase("starting");
      setError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't open the camera here. You can choose an image instead.");
        setPhase("error");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setCameras(devices.filter((d) => d.kind === "videoinput").length);
        setPhase("live");
      } catch (err) {
        setError(CAMERA_ERRORS[err?.name] ?? "Couldn't start the camera. You can choose an image instead.");
        setPhase("error");
      }
    },
    [stop],
  );

  useEffect(() => {
    start(facing);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach the stream once the <video> is on screen (it isn't while a photo is shown).
  useEffect(() => {
    const video = videoRef.current;
    if (video && streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }
  }, [phase]);

  // Free the photo preview URL when it changes or the dialog closes.
  useEffect(() => () => photo?.url && URL.revokeObjectURL(photo.url), [photo]);

  async function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const size = fitWithin(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d").drawImage(video, 0, 0, size.width, size.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    stop();
    setPhoto({ blob, url: URL.createObjectURL(blob), ...size, kind: "photo" });
    setPhase("captured");
  }

  async function chooseFile(file) {
    if (!file) return;
    try {
      stop();
      const prepared = await prepareImage(file);
      setPhoto({ ...prepared, url: URL.createObjectURL(prepared.blob), kind: "image" });
      setPhase("captured");
      setError("");
    } catch (err) {
      setError(err.message || "Couldn't read that image.");
      setPhase("error");
    }
  }

  async function uploadPhoto() {
    setPhase("uploading");
    setError("");
    try {
      const attachment = await attachmentsApi.upload({ ...photo, noteId });
      onUploaded(attachment);
    } catch (err) {
      setError(err.message);
      setPhase("captured");
    }
  }

  function switchCamera() {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    start(next);
  }

  const chooser = (
    <>
      <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
        <Icon name="upload" /> Choose image
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => chooseFile(e.target.files[0])}
      />
    </>
  );

  return (
    <div className="camera">
      <div className="camera-stage">
        {(phase === "starting" || phase === "live") && (
          <video ref={videoRef} className={facing === "user" ? "mirrored" : ""} playsInline muted autoPlay aria-label="Camera preview" />
        )}
        {(phase === "captured" || phase === "uploading") && photo && <img src={photo.url} alt="Your picture" />}
        {phase === "starting" && (
          <div className="camera-overlay">
            <Spinner size={22} /> Starting camera…
          </div>
        )}
        {phase === "error" && (
          <div className="camera-overlay">
            <Icon name="alert" size={26} />
            <p>{error}</p>
          </div>
        )}
      </div>
      {error && phase === "captured" && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <div className="camera-actions">
        {phase === "live" && (
          <>
            {chooser}
            <button type="button" className="shutter" onClick={capture} aria-label="Take picture" title="Take picture" />
            {cameras > 1 ? (
              <button type="button" className="btn" onClick={switchCamera}>
                <Icon name="refresh" /> Switch camera
              </button>
            ) : (
              <span />
            )}
          </>
        )}
        {(phase === "captured" || phase === "uploading") && (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPhoto(null);
                start(facing);
              }}
              disabled={phase === "uploading"}
            >
              Retake
            </button>
            <button type="button" className="btn btn-primary" onClick={uploadPhoto} disabled={phase === "uploading"}>
              {phase === "uploading" ? "Adding…" : "Use picture"}
            </button>
          </>
        )}
        {phase === "error" && (
          <>
            {chooser}
            <button type="button" className="btn btn-ghost" onClick={() => start(facing)}>
              Try camera again
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
