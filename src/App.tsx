import { useCallback, useEffect, useRef, useState } from "react";
import { REQUEST_INTERVAL_MS } from "./constants";
import { FINGERS, HAND_COUNT, initHandLandmarker } from "./hands";

type Landmark = { x: number; y: number; z: number };

type HandData = {
  handElement: HTMLDivElement;
  fingerElements: HTMLDivElement[];
};

export default function App() {
  const [started, setStarted] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const helperTextRef = useRef<HTMLDivElement>(null);
  const webcamRunning = useRef(false);
  const lastVideoTime = useRef(-1);
  const handDataRef = useRef<Record<number, HandData | undefined>>({});
  const handsRef = useRef<(HTMLDivElement | null)[]>([]);
  const latestLandmarksRef = useRef<Landmark[][]>([]);

  const ensureHandData = useCallback((handIndex: number) => {
    if (handDataRef.current[handIndex]) return;

    const handElement = handsRef.current[handIndex];
    if (!handElement) return;

    const fingerElements = Object.values(FINGERS).map((fingerValue) => {
      const finger = document.createElement("div");
      finger.id = `hand-${handIndex}-finger-${fingerValue}`;
      finger.classList.add("finger");
      finger.classList.add(`hand-${handIndex}-finger`);
      handElement.appendChild(finger);
      return finger;
    });

    handDataRef.current[handIndex] = {
      handElement,
      fingerElements,
    };
  }, []);

  const predictWebcam = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    const handLandmarker = await initHandLandmarker();

    let startTimeMs = performance.now();
    if (lastVideoTime.current !== video.currentTime) {
      lastVideoTime.current = video.currentTime;
    }

    const results = handLandmarker.detectForVideo(video, startTimeMs);

    const container = containerRef.current;
    const width = container ? container.clientWidth : window.innerWidth;
    const height = container ? container.clientHeight : window.innerHeight;

    latestLandmarksRef.current = results.landmarks;

    const handHasDataList: boolean[] = [];
    for (let i = 0; i < HAND_COUNT; i++) {
      handHasDataList.push(!!results.landmarks[i]?.length);
    }

    results.landmarks.forEach((hand, handIndex) => {
      ensureHandData(handIndex);

      const data = handDataRef.current[handIndex];
      if (!data) return;

      const hasData = handHasDataList[handIndex];
      if (hasData && data.handElement.classList.contains("opacity-none")) {
        data.handElement.classList.remove("opacity-none");
      }

      hand.forEach((finger, fingerIndex) => {
        const fingerElement = data.fingerElements[fingerIndex];
        if (!fingerElement) return;

        fingerElement.style.top = `${finger.y * height}px`;
        fingerElement.style.left = `${width - finger.x * width}px`;
      });
    });

    handHasDataList.forEach((hasData, handIndex) => {
      ensureHandData(handIndex);
      const data = handDataRef.current[handIndex];
      if (!data) return;

      if (!hasData) {
        if (!data.handElement.classList.contains("opacity-none")) {
          data.handElement.classList.add("opacity-none");
        }
      }
    });

    const helper = helperTextRef.current;
    if (helper) {
      const anyHands = handHasDataList.some(Boolean);
      if (!anyHands) {
        if (helper.classList.contains("opacity-none")) {
          helper.classList.remove("opacity-none");
        }
      } else {
        if (!helper.classList.contains("opacity-none")) {
          helper.classList.add("opacity-none");
        }
      }
    }

    if (webcamRunning.current) {
      window.requestAnimationFrame(predictWebcam);
    }
  }, [ensureHandData]);

  const handleStart = () => {
    setStarted(true);
  };

  useEffect(() => {
    if (!started) return;

    const video = videoRef.current;
    if (!video) return;

    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: "user" } })
      .then((stream) => {
        video.srcObject = stream;
        webcamRunning.current = true;
        video.addEventListener("loadeddata", predictWebcam);
      });

    return () => {
      webcamRunning.current = false;
      video.removeEventListener("loadeddata", predictWebcam);
    };
  }, [started, predictWebcam]);

  useEffect(() => {
    if (!started) return;

    const apiUrl = import.meta.env.VITE_PUBLIC_API_URL as string | undefined;
    if (!apiUrl) {
      console.warn("VITE_PUBLIC_API_URL is not defined");
    }

    const interval = setInterval(() => {
      const landmarks = latestLandmarksRef.current;
      landmarks.forEach((hand, handIndex) => {
        if (!hand || hand.length === 0) return;
        if (handIndex > 1) return; // only two tentacles

        const avgY = hand.reduce((sum, lm) => sum + lm.y, 0) / hand.length;
        const heightValue = Math.max(0, Math.min(1, 1 - avgY));

        fetch(`${apiUrl}/arm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tentacle: handIndex, height: heightValue }),
        });
      });
    }, REQUEST_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [started]);

  return (
    <div ref={containerRef} className="app-container">
      {!started ? (
        <div className="landing">
          <h1>Click to start!</h1>
          <button onClick={handleStart}>Start</button>
        </div>
      ) : (
        <div ref={helperTextRef} className="landing opacity-none">
          <h1>Hold up your hands!</h1>
        </div>
      )}

      <video ref={videoRef} className="hidden" autoPlay muted playsInline />

      <div className="hands-layer">
        {Array.from({ length: HAND_COUNT }).map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              handsRef.current[i] = el;
            }}
            className="opacity-none hand-container"
          />
        ))}
      </div>
    </div>
  );
}
