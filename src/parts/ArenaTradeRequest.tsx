import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { useWebSocketEvent } from "@/hooks/use-websocket";
import {
  sendArenaTradeRequest,
  cancelArenaTradeRequest,
  type ArenaTradeUser,
} from "@/lib/arena-api";

type ArenaTradeRequestProps = {
  user: ArenaTradeUser;
  onClose: () => void;
  onSessionStart: (sessionId: string) => void;
};

type Step = "ask" | "waiting" | "declined";

const ArenaTradeRequest = ({
  user,
  onClose,
  onSessionStart,
}: ArenaTradeRequestProps) => {
  const auth = useOptionalAuth();
  const token = auth?.token || null;
  const [step, setStep] = useState<Step>("ask");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const stepRef = useRef<Step>("ask");

  const setStepWrapper = useCallback((s: Step) => {
    stepRef.current = s;
    setStep(s);
  }, []);

  const setRequestIdWrapper = useCallback((id: string | null) => {
    requestIdRef.current = id;
    setRequestId(id);
  }, []);

  const handleSendRequest = useCallback(async () => {
    if (!token) return;
    try {
      const result = await sendArenaTradeRequest(token, user.id);
      setRequestIdWrapper(result.requestId);
      setStepWrapper("waiting");
    } catch {
      setMessage("Failed to send trade request.");
    }
  }, [token, user.id]);

  useWebSocketEvent("arena:trade:request-update", (data) => {
    const update = data as { requestId: string; status: string; sessionId?: string };
    if (update.requestId !== requestIdRef.current) return;
    if (stepRef.current !== "waiting" || !token) return;

    if (update.status === "accepted" && update.sessionId) {
      onSessionStart(update.sessionId);
      return;
    }
    if (update.status === "cancelled") {
      setStepWrapper("declined");
      setMessage("Trade request was cancelled.");
      return;
    }
    if (update.status === "denied") {
      setStepWrapper("declined");
      setMessage("Trade request was declined.");
      return;
    }
    if (update.status !== "pending") {
      setStepWrapper("declined");
      setMessage("Trade request ended.");
    }
  });

  const handleCancel = useCallback(async () => {
    if (!token || !requestId) return;
    try {
      await cancelArenaTradeRequest(token, requestId);
    } catch {
      // ignore
    }
    onClose();
  }, [token, requestId, onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "waiting") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, step]);

  return createPortal(
    <div
      className="fixed inset-0 z-[230000] flex items-center justify-center bg-white/50 p-4 backdrop-blur-sm dark:bg-slate-950/70"
      onClick={step !== "waiting" ? onClose : undefined}
    >
      <section
        role="dialog"
        aria-modal="true"
        className="card-border w-full max-w-sm rounded-2xl p-5 shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "ask" && (
          <div className="space-y-4 text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-500">
              trade request
            </p>
            <div className="flex items-center justify-center gap-3">
              {user.avatar && (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="h-10 w-10 rounded-full border-2 border-pink-200 dark:border-pink-500/40"
                />
              )}
              <h2 className="text-xl font-bold text-blue-700 dark:text-purple-100">
                {user.username}
              </h2>
            </div>
            <p className="text-sm text-blue-600 dark:text-purple-200">
              Trade with {user.username}?
            </p>
            {message && (
              <p className="text-xs font-semibold text-red-500">{message}</p>
            )}
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="arena-redraw-button hover:animate-wiggle"
              >
                [ cancel ]
              </button>
              <button
                type="button"
                onClick={() => void handleSendRequest()}
                className="arena-redraw-button hover:animate-wiggle"
              >
                [ send trade request ]
              </button>
            </div>
          </div>
        )}

        {step === "waiting" && (
          <div className="space-y-4 text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-500">
              trade request
            </p>
            <p className="text-lg font-bold text-blue-700 dark:text-purple-100">
              Waiting for {user.username} to respond...
            </p>
            <div className="flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-pink-300 border-t-transparent" />
            </div>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => void handleCancel()}
                className="arena-redraw-button hover:animate-wiggle"
              >
                [ cancel request ]
              </button>
            </div>
          </div>
        )}

        {step === "declined" && (
          <div className="space-y-4 text-center">
            <p className="text-lg font-bold text-blue-700 dark:text-purple-100">
              {message || "Trade request ended."}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="arena-redraw-button hover:animate-wiggle"
            >
              [ close ]
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
};

export default ArenaTradeRequest;
