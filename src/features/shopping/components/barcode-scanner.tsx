"use client";

import { useEffect, useRef, useState } from "react";

type BarcodeScannerProps = {
  onScan: (barcode: string) => void;
  onClose: () => void;
};

// BarcodeDetector API types (not yet in standard TS lib)
declare global {
  interface Window {
    BarcodeDetector?: new (options?: {
      formats: string[];
    }) => {
      detect: (
        source: ImageBitmapSource,
      ) => Promise<{ rawValue: string }[]>;
    };
  }
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [manualBarcode, setManualBarcode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scanningRef = useRef(false);

  useEffect(() => {
    if (!("BarcodeDetector" in window) || !window.BarcodeDetector) {
      setIsSupported(false);
      return;
    }

    let cancelled = false;
    const detector = new window.BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
    });

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scanLoop(detector);
        }
      } catch {
        setError("Could not access camera");
        setIsSupported(false);
      }
    }

    async function scanLoop(
      det: InstanceType<NonNullable<typeof window.BarcodeDetector>>,
    ) {
      if (cancelled || !videoRef.current || scanningRef.current) return;
      scanningRef.current = true;

      try {
        const barcodes = await det.detect(videoRef.current);
        if (barcodes.length > 0 && !cancelled) {
          onScan(barcodes[0].rawValue);
          cleanup();
          return;
        }
      } catch {
        // Detection can fail on some frames, continue
      }

      scanningRef.current = false;
      if (!cancelled) {
        requestAnimationFrame(() => scanLoop(det));
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanup() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualBarcode.trim()) {
      onScan(manualBarcode.trim());
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between bg-black/80 px-4 py-3">
        <h2 className="text-sm font-medium text-white">Scan Barcode</h2>
        <button
          type="button"
          onClick={() => {
            cleanup();
            onClose();
          }}
          className="rounded-full p-1 text-white hover:bg-white/20"
          aria-label="Close scanner"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {isSupported && !error ? (
        <div className="relative flex flex-1 items-center justify-center">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
          />
          {/* Viewfinder overlay */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-48 w-72 rounded-lg border-2 border-white/70 shadow-lg">
              <div className="absolute left-0 top-0 h-6 w-6 border-l-4 border-t-4 border-white rounded-tl-lg" />
              <div className="absolute right-0 top-0 h-6 w-6 border-r-4 border-t-4 border-white rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 h-6 w-6 border-b-4 border-l-4 border-white rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 h-6 w-6 border-b-4 border-r-4 border-white rounded-br-lg" />
            </div>
          </div>
          <p className="absolute bottom-8 text-center text-xs text-white/70">
            Point camera at a barcode
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <p className="mb-4 text-center text-sm text-white/70">
            {error ?? "Barcode scanner is not supported on this device."}
          </p>
          <p className="mb-6 text-center text-sm text-white/70">
            Enter the barcode manually:
          </p>
          <form onSubmit={handleManualSubmit} className="flex w-full max-w-xs gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              placeholder="Barcode number"
              autoFocus
              className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Go
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
