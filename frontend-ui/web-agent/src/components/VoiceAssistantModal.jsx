import { useEffect, useMemo, useRef, useState } from "react";
import voiceBot from "../assets/voicebot.png";
import {
  initializeVoiceSession,
  processVoiceAudio,
  synthesizeVoiceText,
} from "../api/voiceAssistant";

function buildWelcomeMessage(label) {
  return {
    sender: "isa",
    text:
      label === "Parler au 311"
        ? "Cliquez sur « Démarrer la session » pour parler à ISA."
        : "Click “Start session” to speak with ISA.",
  };
}

function decodeHeaderText(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(escape(value));
  } catch {
    return value;
  }
}

function inferDetectedDetailsFromText(text = "") {
  const lower = text.toLowerCase();

  let category = "";
  let nextStep = "";

  if (lower.includes("pothole")) {
    category = "Pothole / Road Issue";
  } else if (lower.includes("parking")) {
    category = "Parking";
  } else if (lower.includes("snow")) {
    category = "Snow / Sidewalk";
  } else if (lower.includes("graffiti")) {
    category = "Graffiti";
  } else if (lower.includes("garbage") || lower.includes("waste")) {
    category = "Waste / Garbage";
  }

  if (lower.includes("ticket number is")) {
    nextStep = "Ticket created";
  } else if (
    lower.includes("please describe your issue") ||
    lower.includes("please confirm") ||
    lower.includes("can you confirm")
  ) {
    nextStep = "More information needed";
  }

  return {
    category,
    nextStep,
  };
}

function inferLocationFromTranscript(transcript = "") {
  const text = transcript.trim();
  if (!text) return "";

  const nearMatch = text.match(/\b(?:near|at|on|in front of|around)\s+(.+)/i);
  if (nearMatch?.[1]) {
    return nearMatch[1].trim().replace(/[.?!]+$/, "");
  }

  return "";
}

export default function VoiceAssistantModal({
  open,
  onClose,
  label = "Talk to ISA",
}) {
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState("Ready");
  const [messages, setMessages] = useState([]);
  const [details, setDetails] = useState({
    category: "",
    location: "",
    nextStep: "",
  });
  const [error, setError] = useState("");

  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [isRecorderSupported, setIsRecorderSupported] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [turnCount, setTurnCount] = useState(0);

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const activeAudioUrlRef = useRef(null);
  const activeAudioRef = useRef(null);
  const isMountedRef = useRef(false);

  const isFrench = useMemo(() => /parler/i.test(label), [label]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setIsRecorderSupported(
      typeof window !== "undefined" &&
        !!navigator.mediaDevices &&
        !!navigator.mediaDevices.getUserMedia &&
        typeof MediaRecorder !== "undefined"
    );
  }, []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    setSessionId("");
    setStatus("Ready");
    setMessages([buildWelcomeMessage(label)]);
    setDetails({
      category: "",
      location: "",
      nextStep: "",
    });
    setError("");
    setIsStartingSession(false);
    setIsEndingSession(false);
    setIsSpeaking(false);
    setIsListening(false);
    setTurnCount(0);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
      cleanupRecorder();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, label]);

  function cleanupAudioPlayback() {
    try {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
      }
    } catch {
      // ignore
    }

    activeAudioRef.current = null;

    if (activeAudioUrlRef.current) {
      URL.revokeObjectURL(activeAudioUrlRef.current);
      activeAudioUrlRef.current = null;
    }

    if (isMountedRef.current) {
      setIsSpeaking(false);
    }
  }

  async function playAudioBlob(blob, { onEnded } = {}) {
    if (!blob || blob.size === 0) {
      console.warn("playAudioBlob called with empty blob");
      return;
    }

    cleanupAudioPlayback();

    const audioUrl = URL.createObjectURL(blob);
    activeAudioUrlRef.current = audioUrl;

    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    activeAudioRef.current = audio;

    console.log("Audio blob size:", blob.size);
    console.log("Attempting audio playback...");

    return new Promise(async (resolve, reject) => {
      const finalize = () => {
        if (activeAudioRef.current === audio) {
          activeAudioRef.current = null;
        }
        if (activeAudioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          activeAudioUrlRef.current = null;
        }
        if (isMountedRef.current) {
          setIsSpeaking(false);
        }
      };

      audio.onended = async () => {
        console.log("Audio playback ended");
        finalize();

        try {
          if (onEnded) {
            await onEnded();
          }
        } catch (callbackErr) {
          console.error("Audio onEnded callback failed:", callbackErr);
        }

        resolve();
      };

      audio.onerror = (err) => {
        console.error("Audio playback error:", err);
        finalize();
        reject(err);
      };

      try {
        if (isMountedRef.current) {
          setIsSpeaking(true);
        }
        await audio.play();
        console.log("Audio playback started successfully");
      } catch (err) {
        console.error("Audio playback blocked or failed:", err);
        finalize();
        reject(err);
      }
    });
  }

  function cleanupRecorder() {
    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
    } catch {
      // ignore
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
    }

    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    recordedChunksRef.current = [];

    if (isMountedRef.current) {
      setIsListening(false);
    }

    cleanupAudioPlayback();
  }

  function handleClose() {
    cleanupRecorder();
    onClose?.();
  }

  async function handleStartSession() {
    if (isStartingSession || isSpeaking || isListening) return;

    setIsStartingSession(true);
    setError("");
    setStatus("Connecting");

    try {
      console.log("Initializing voice session...");

      const data = await initializeVoiceSession({
        channel: "VOICE",
        language: isFrench ? "fr" : "en",
      });

      const newSessionId = data?.session_id;
      const greetingText =
        data?.action?.text ||
        (isFrench
          ? "Session connectée. Vous pouvez commencer à parler."
          : "Session connected. You can start speaking.");

      if (!newSessionId) {
        throw new Error("Session ID not returned by backend.");
      }

      console.log("Voice session initialized:", newSessionId);
      console.log("Greeting text:", greetingText);

      setSessionId(newSessionId);
      setStatus("Connected");
      setMessages((current) => [
        ...current,
        {
          sender: "isa",
          text: greetingText,
        },
      ]);
      setDetails((current) => ({
        ...current,
        nextStep: isFrench ? "Lecture du message d'accueil" : "Playing greeting",
      }));

      try {
        console.log("Requesting greeting audio...");
        const welcomeAudioBlob = await synthesizeVoiceText(greetingText);
        console.log("Greeting audio received:", welcomeAudioBlob?.size || 0);

        await playAudioBlob(welcomeAudioBlob, {
          onEnded: async () => {
            console.log("Greeting finished, starting listening...");
            setDetails((current) => ({
              ...current,
              nextStep: isFrench ? "Écoute en cours" : "Listening",
            }));

            try {
              await handleStartListening({
                sessionOverride: newSessionId,
                autoTriggered: true,
              });
            } catch (listenErr) {
              console.error("Auto-start listening failed:", listenErr);
            }
          },
        });
      } catch (ttsErr) {
        console.warn("Welcome message TTS failed:", ttsErr);
        setDetails((current) => ({
          ...current,
          nextStep: isFrench ? "Prêt pour l'entrée vocale" : "Ready for voice input",
        }));
      }
    } catch (err) {
      console.error("Start session failed:", err);
      setSessionId("");
      setStatus("Error");
      setError(err?.message || "Failed to start session.");
      setMessages((current) => [
        ...current,
        {
          sender: "isa",
          text: isFrench
            ? "Impossible de démarrer la session backend."
            : "Unable to start the backend session.",
        },
      ]);
    } finally {
      setIsStartingSession(false);
    }
  }

  function handleEndSession() {
    cleanupRecorder();
    setIsEndingSession(true);
    setStatus("Ready");
    setSessionId("");
    setTurnCount(0);
    setDetails({
      category: "",
      location: "",
      nextStep: "",
    });
    setMessages((current) => [
      ...current,
      {
        sender: "isa",
        text: isFrench ? "Session terminée." : "Session ended.",
      },
    ]);
    setError("");
    setTimeout(() => {
      if (isMountedRef.current) {
        setIsEndingSession(false);
      }
    }, 150);
  }

  async function handleStartListening(options = {}) {
    const { sessionOverride = "", autoTriggered = false } = options;
    const effectiveSessionId = sessionOverride || sessionId;

    if (isSpeaking) {
      console.warn("Cannot start listening while audio is speaking.");
      return;
    }

    if (isListening) {
      console.warn("Recorder is already listening.");
      return;
    }

    if (!effectiveSessionId) {
      setStatus("Error");
      setError(
        isFrench
          ? "Veuillez démarrer une session avant d'utiliser le micro."
          : "Please start a session before using the microphone."
      );
      return;
    }

    if (!isRecorderSupported) {
      setStatus("Error");
      setError(
        isFrench
          ? "L'enregistrement audio n'est pas pris en charge dans ce navigateur."
          : "Audio recording is not supported in this browser."
      );
      return;
    }

    setError("");

    try {
      console.log(
        autoTriggered
          ? "Auto-starting microphone after greeting..."
          : "Starting microphone manually..."
      );

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const preferredMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];

      const supportedMimeType =
        preferredMimeTypes.find((type) =>
          MediaRecorder.isTypeSupported?.(type)
        ) || "";

      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        console.error("Recorder error triggered");
        setStatus("Error");
        setIsListening(false);
        setError(
          isFrench
            ? "Une erreur est survenue pendant l'enregistrement."
            : "An error occurred during recording."
        );
      };

      recorder.onstop = async () => {
        try {
          console.log("Recorder stopped, processing audio...");
          const chunks = recordedChunksRef.current || [];

          if (!chunks.length) {
            setStatus("Connected");
            setError(
              isFrench
                ? "Aucun audio n'a été capturé."
                : "No audio was captured."
            );
            return;
          }

          const mimeType = recorder.mimeType || "audio/webm";
          const extension = mimeType.includes("mp4") ? "mp4" : "webm";
          const audioBlob = new Blob(chunks, { type: mimeType });

          console.log("Recorded audio blob size:", audioBlob.size);

          recordedChunksRef.current = [];
          setStatus("Processing");

          const result = await processVoiceAudio({
            sessionId: effectiveSessionId,
            turn: turnCount + 1,
            audioBlob,
            filename: `voice-turn-${turnCount + 1}.${extension}`,
          });

          const transcript = decodeHeaderText(result.transcript || "");
          const responseText = decodeHeaderText(result.responseText || "");

          console.log("Transcript:", transcript);
          console.log("Response text:", responseText);
          console.log("Current state:", result.currentState || "");

          if (transcript) {
            setMessages((current) => [
              ...current,
              { sender: "citizen", text: transcript },
            ]);
          }

          if (responseText) {
            setMessages((current) => [
              ...current,
              { sender: "isa", text: responseText },
            ]);
          }

          const inferred = inferDetectedDetailsFromText(responseText);
          const inferredLocation = inferLocationFromTranscript(transcript);

          setDetails((current) => ({
            category: inferred.category || current.category || "",
            location: inferredLocation || current.location || "",
            nextStep:
              inferred.nextStep ||
              (result.currentState
                ? `State: ${result.currentState}`
                : current.nextStep || ""),
          }));

          setTurnCount((value) => value + 1);
          setStatus("Connected");

          if (result.audioBlob && result.audioBlob.size > 0) {
            console.log("Playing reply audio...");
            await playAudioBlob(result.audioBlob);
          }
        } catch (err) {
          console.error("Failed to process audio:", err);
          setStatus("Error");
          setError(err?.message || "Failed to process audio.");
        } finally {
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => {
              try {
                track.stop();
              } catch {
                // ignore
              }
            });
          }
          mediaStreamRef.current = null;
          mediaRecorderRef.current = null;
          setIsListening(false);
        }
      };

      recorder.start();
      setIsListening(true);
      setStatus("Listening");
      console.log("Recorder started successfully");
    } catch (err) {
      console.error("Microphone access failed:", err);
      setStatus("Error");
      setError(
        err?.message ||
          (isFrench
            ? "Impossible d'accéder au microphone."
            : "Unable to access microphone.")
      );
    }
  }

  function handleStopListening() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    console.log("Stopping recorder...");

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  if (!open) return null;

  const canStartSession =
    !isStartingSession && !sessionId && !isSpeaking && !isListening;

  const canEndSession =
    !!sessionId && !isListening && !isEndingSession && !isSpeaking;

  const canStartListening =
    !!sessionId && !isListening && status !== "Processing" && !isSpeaking;

  const canStopListening = !!sessionId && isListening;

  return (
    <div className="isaOverlay" onClick={handleClose}>
      <aside
        className="isaPanel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="isaPanelTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="isaPanelHeader">
          <div className="isaPanelTitleWrap">
            <img
              src={voiceBot}
              alt=""
              aria-hidden="true"
              className="isaPanelAvatar"
            />
            <div>
              <h2 id="isaPanelTitle">{label}</h2>
              <p>
                {isFrench
                  ? "Votre assistante virtuelle"
                  : "Your municipal virtual assistant"}
              </p>
            </div>
          </div>

          <button
            className="isaCloseBtn"
            type="button"
            onClick={handleClose}
            aria-label="Close voice assistant"
          >
            ×
          </button>
        </div>

        <div className="isaSessionBar">
          <span>
            {isFrench ? "Statut" : "Status"}: <strong>{status}</strong>
          </span>
          <span>
            {isFrench ? "Session" : "Session"}:{" "}
            <strong>{sessionId || "—"}</strong>
          </span>
        </div>

        <div className="isaStartRow" style={{ flexWrap: "wrap" }}>
          <button
            className="isaPrimaryBtn"
            type="button"
            onClick={handleStartSession}
            disabled={!canStartSession}
          >
            {isStartingSession
              ? isFrench
                ? "Démarrage..."
                : "Starting..."
              : isFrench
              ? "Démarrer la session"
              : "Start session"}
          </button>

          <button
            className="isaGhostBtn"
            type="button"
            onClick={handleEndSession}
            disabled={!canEndSession}
          >
            {isFrench ? "Terminer" : "End session"}
          </button>

          <button
            className="isaGhostBtn"
            type="button"
            onClick={() => handleStartListening()}
            disabled={!canStartListening}
          >
            {isFrench ? "Commencer l'écoute" : "Start listening"}
          </button>

          <button
            className="isaGhostBtn"
            type="button"
            onClick={handleStopListening}
            disabled={!canStopListening}
          >
            {isFrench ? "Arrêter l'écoute" : "Stop listening"}
          </button>
        </div>

        {error ? <div className="isaNotice">{error}</div> : null}

        <div className="isaConversation">
          {messages.map((message, index) => (
            <div
              key={`${message.sender}-${index}`}
              className={`isaMessage ${
                message.sender === "citizen" ? "fromCitizen" : "fromIsa"
              }`}
            >
              <strong>
                {message.sender === "citizen"
                  ? isFrench
                    ? "Vous"
                    : "You"
                  : "ISA"}
              </strong>
              <span>{message.text}</span>
            </div>
          ))}
        </div>

        <div className="isaDetailsCard">
          <div className="isaDetailsTitle">
            {isFrench ? "Détails détectés" : "Detected details"}
          </div>

          <div className="isaDetailsRow">
            <span>{isFrench ? "Catégorie" : "Category"}</span>
            <strong>{details.category || "—"}</strong>
          </div>

          <div className="isaDetailsRow">
            <span>{isFrench ? "Emplacement" : "Location"}</span>
            <strong>{details.location || "—"}</strong>
          </div>

          <div className="isaDetailsRow">
            <span>{isFrench ? "Prochaine étape" : "Next step"}</span>
            <strong>{details.nextStep || "—"}</strong>
          </div>
        </div>
      </aside>
    </div>
  );
}