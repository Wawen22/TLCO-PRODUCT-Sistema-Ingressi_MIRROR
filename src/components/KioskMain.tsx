import React, { useCallback, useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest } from "../config/authConfig";
import { AccessiService } from "../services/accessiService";
import { SharePointService } from "../services/sharepointService";
import { useTranslation } from "react-i18next";
import QrScanner from "qr-scanner";
import qrScannerWorkerUrl from "qr-scanner/qr-scanner-worker.min.js?url";

QrScanner.WORKER_PATH = qrScannerWorkerUrl;

interface KioskMainProps {
  onAdminAccess: () => void;
  canAccessAdmin: boolean;
  authMode: "QR" | "EMAIL";
}

type StatusType = "idle" | "success" | "error";
type ActionType = "ingresso" | "uscita";

type VisitatoreItem = {
  idVisitatore: string;
  itemId?: string;
  nome?: string;
  cognome?: string;
  azienda?: string;
  email?: string;
  categoria?: string;
  enteRiferimento?: string;
  progetto?: string;
  commessa?: string;
  attivita?: string;
  videoTutorialSeen?: boolean;
};

// Removed static privacyDocuments array

const normalizeVisitatori = (data: any[]): VisitatoreItem[] =>
  (data || []).map((item: any) => {
    const email = item?.fields?.Email || item?.fields?.email; // tolerate casing variants
    return {
      itemId: item?.id,
      idVisitatore: item?.fields?.Title || "",
      nome: item?.fields?.Nome,
      cognome: item?.fields?.Cognome,
      azienda: item?.fields?.Azienda,
      email,
      categoria: item?.fields?.Categoria,
      enteRiferimento: item?.fields?.EnteRiferimento,
      progetto: item?.fields?.Progetto,
      commessa: item?.fields?.Commessa,
      attivita: item?.fields?.Attivita,
      videoTutorialSeen: Boolean(item?.fields?.VideoTutorialVisto),
    };
  });

export const KioskMain: React.FC<KioskMainProps> = ({ onAdminAccess, canAccessAdmin, authMode }) => {
  const { instance, accounts } = useMsal();
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language || "it") as "it" | "en";

  const [visitatori, setVisitatori] = useState<VisitatoreItem[]>([]);
  // Dynamic Privacy Docs State
  const [privacyDocs, setPrivacyDocs] = useState<{ label: string; file: string; id: string; driveId: string }[]>([]);
  const [selectedPrivacyUrl, setSelectedPrivacyUrl] = useState<string>("");
  const [isPrivacyLoading, setIsPrivacyLoading] = useState(false);
  
  const [loading, setLoading] = useState<ActionType | null>(null);
  const [status, setStatus] = useState<StatusType>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTimeout, setStatusTimeout] = useState(3000);
  const [statusTitle, setStatusTitle] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState<"new" | "resend">("new");
  const [obNome, setObNome] = useState("");
  const [obCognome, setObCognome] = useState("");
  const [obEmail, setObEmail] = useState("");
  const [obAzienda, setObAzienda] = useState("");
  const [obCategoria, setObCategoria] = useState("Visitatore");
  const [obEnteRiferimento, setObEnteRiferimento] = useState("");
  const [obProgetto, setObProgetto] = useState("");
  const [obCommessa, setObCommessa] = useState("");
  const [obAttivita, setObAttivita] = useState("");
  const [obError, setObError] = useState("");
  const [obValidationError, setObValidationError] = useState("");
  const [obLoading, setObLoading] = useState(false);
  const [obAcceptedTerms, setObAcceptedTerms] = useState(false);
  const [showPrivacyViewer, setShowPrivacyViewer] = useState(false);
  const [selectedPrivacyDoc, setSelectedPrivacyDoc] = useState<string>("");

  // Email Auth State
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [emailAuthStep, setEmailAuthStep] = useState<"email" | "otp">("email");
  const [emailAuthInput, setEmailAuthInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [emailAuthAction, setEmailAuthAction] = useState<ActionType | null>(null);
  const [emailAuthError, setEmailAuthError] = useState("");
  const [emailAuthLoading, setEmailAuthLoading] = useState(false);

  const [visitatoriAccessDenied, setVisitatoriAccessDenied] = useState(false);
  const [now, setNow] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"home" | "scan">("home");

  const [showScanner, setShowScanner] = useState(false);
  const [scannerState, setScannerState] = useState<"idle" | "waiting" | "success" | "error">("idle");
  const [scannerMessage, setScannerMessage] = useState(() => t("scanner.placeQr"));
  const [scannerAction, setScannerAction] = useState<ActionType | null>(null);
  const [scannerProcessing, setScannerProcessing] = useState(false);
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<{ accessoId: string; visitatore?: VisitatoreItem | null } | null>(null);
  const [destinationLoading, setDestinationLoading] = useState(false);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [pendingTutorial, setPendingTutorial] = useState<{ accessoId: string; visitatore: VisitatoreItem } | null>(null);
  const [tutorialLoading, setTutorialLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scanLockRef = useRef(false); // prevents duplicate processing while a scan is being handled
  const lastScanRef = useRef<{ code: string; ts: number } | null>(null);

  const changeLanguage = useCallback(
    (lng: "it" | "en") => {
      i18n.changeLanguage(lng).catch((err) => console.error("Change language error", err));
    },
    [i18n]
  );

  const showStatus = useCallback(
    (type: StatusType, message: string, duration = 3000, title?: string) => {
      setStatusTimeout(duration);
      setStatus(type);
      setStatusMessage(message);
      setStatusTitle(title || (type === "success" ? t("status.successDefault") : t("status.errorDefault")));
    },
    [t]
  );

  const ensureAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }

    const ctx = audioCtxRef.current;
    if (!ctx) return null;

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    return ctx;
  }, []);

  const playTone = useCallback(
    (frequency: number, offsetSeconds: number, durationSeconds: number, volume = 0.18) => {
      const ctx = ensureAudioContext();
      if (!ctx) return;

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      const startTime = ctx.currentTime + offsetSeconds;
      const endTime = startTime + durationSeconds;

      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(startTime);
      oscillator.stop(endTime);
    },
    [ensureAudioContext]
  );

  const triggerFeedback = useCallback(
    (type: "success" | "error") => {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(type === "success" ? [18, 60, 18] : [180, 90, 180]);
      }

      if (type === "success") {
        playTone(940, 0, 0.12, 0.14);
        playTone(1180, 0.1, 0.12, 0.12);
      } else {
        playTone(320, 0, 0.22, 0.22);
        playTone(220, 0.18, 0.26, 0.18);
      }
    },
    [playTone]
  );

  const loadVisitatori = useCallback(async () => {
    try {
      if (!accounts.length) return;

      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });

      const accessToken = response.accessToken;
      const siteId = import.meta.env.VITE_SHAREPOINT_SITE_ID;
      const visitatoriListId = import.meta.env.VITE_SHAREPOINT_LIST_ID;

      const sharepointService = new SharePointService(accessToken, siteId, visitatoriListId);
      const data = await sharepointService.getVisitatori();

      const normalized: VisitatoreItem[] = normalizeVisitatori(data);
      setVisitatori(normalized.filter((v) => v.idVisitatore));
      setVisitatoriAccessDenied(false);
    } catch (error) {
      const code = (error as any)?.code || (error as any)?.message;
      if (code === "AccessDenied" || code === "access_denied") {
        setVisitatoriAccessDenied(true);
        showStatus("error", t("status.permissionReadVisitors"));
        return;
      }
      if (error instanceof InteractionRequiredAuthError) {
        try {
          await instance.acquireTokenRedirect(loginRequest);
          return;
        } catch (redirectError) {
          console.error("Errore redirect autenticazione:", redirectError);
        }
      }

      console.error("Errore caricamento visitatori:", error);
      showStatus("error", t("status.sessionExpired"));
    }
  }, [accounts, instance, showStatus, t]);

  // Effect to load PDF content as blob
  useEffect(() => {
    let active = true;
    let objectUrl = "";

    const fetchContent = async () => {
      if (!selectedPrivacyDoc || !privacyDocs.length) return;
      
      const doc = privacyDocs.find(d => d.file === selectedPrivacyDoc);
      if (!doc || !doc.driveId || !doc.id) return;

      setIsPrivacyLoading(true);
      try {
        const response = await instance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        });
        const svc = new SharePointService(response.accessToken, import.meta.env.VITE_SHAREPOINT_SITE_ID, import.meta.env.VITE_SHAREPOINT_LIST_ID);
        const blob = await svc.getDocumentContent(doc.driveId, doc.id);
        
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setSelectedPrivacyUrl(objectUrl);
        }
      } catch (error) {
        console.error("Errore download contenuto PDF:", error);
      } finally {
        if (active) setIsPrivacyLoading(false);
      }
    };

    fetchContent();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedPrivacyDoc, privacyDocs, accounts, instance]);

  const loadPrivacyDocs = useCallback(async () => {
    try {
      if (!accounts.length) return;
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });
      const svc = new SharePointService(response.accessToken, import.meta.env.VITE_SHAREPOINT_SITE_ID, import.meta.env.VITE_SHAREPOINT_LIST_ID);
      const docs = await svc.getPrivacyDocuments();
      
      const mappedDocs = docs.map((d: any) => ({
        label: d.name.replace(/\.pdf$/i, ""),
        file: d.name,
        id: d.id,
        driveId: d.parentReference?.driveId
      })).sort((a: any, b: any) => a.label.localeCompare(b.label));

      setPrivacyDocs(mappedDocs);
      if (mappedDocs.length > 0 && !selectedPrivacyDoc) {
        setSelectedPrivacyDoc(mappedDocs[0].file);
      }
    } catch (error) {
      console.error("Errore caricamento documenti privacy:", error);
    }
  }, [accounts, instance, selectedPrivacyDoc]);

  useEffect(() => {
    loadVisitatori();
    loadPrivacyDocs();
  }, [loadVisitatori, loadPrivacyDocs]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch (error) {
        console.warn("Stop scanner error", error);
      }
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
  }, []);

  const callPowerAutomate = useCallback(async (payload: Record<string, any>) => {
    const flowUrl = import.meta.env.VITE_PA_SEND_QR_URL;
    if (!flowUrl) {
      showStatus("error", t("status.paConfigMissing"));
      return;
    }

    try {
      const res = await fetch(flowUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("❌ PowerAutomate call failed", res.status, res.statusText, text);
        showStatus("error", `PowerAutomate error ${res.status}`);
      } else {
        console.info("✅ PowerAutomate trigger sent");
      }
    } catch (err) {
      console.error("❌ PowerAutomate call error", err);
      showStatus("error", "Errore chiamata PowerAutomate");
    }
  }, [t, showStatus]);

  const closeScanner = useCallback(() => {
    stopScanner();
    setShowScanner(false);
    setScannerState("idle");
    setScannerMessage(t("scanner.placeQr"));
    setScannerProcessing(false);
    setScannerAction(null);
    setLoading(null);
    setViewMode("home");
    scanLockRef.current = false;
  }, [stopScanner, setViewMode]);

  const goToHome = useCallback(() => {
    setViewMode("home");
    closeScanner();
    setShowEmailAuth(false);
    setLoading(null);
  }, [closeScanner]);

  const goToScanView = useCallback(() => {
    setViewMode("scan");
  }, []);

  const openDestinationModal = useCallback((accessoId: string, visitatore?: VisitatoreItem | null) => {
    setPendingDestination({ accessoId, visitatore });
    setShowDestinationModal(true);
  }, []);

  const closeDestinationModal = useCallback(() => {
    setShowDestinationModal(false);
    setPendingDestination(null);
    setDestinationLoading(false);
  }, []);

  const openTutorialModal = useCallback((accessoId: string, visitatore: VisitatoreItem) => {
    setPendingTutorial({ accessoId, visitatore });
    setShowTutorialModal(true);
  }, []);

  const closeTutorialModal = useCallback(() => {
    setShowTutorialModal(false);
    setPendingTutorial(null);
    setTutorialLoading(false);
  }, []);

  const handleTutorialAcknowledge = useCallback(async () => {
    if (!pendingTutorial || !accounts.length) {
      showStatus("error", t("status.sessionNotAuth"));
      return;
    }

    setTutorialLoading(true);
    try {
      const tokenResponse = await instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });

      const accessToken = tokenResponse.accessToken;
      const siteId = import.meta.env.VITE_SHAREPOINT_SITE_ID;
      const visitatoriListId = import.meta.env.VITE_SHAREPOINT_LIST_ID;

      const sharepointService = new SharePointService(accessToken, siteId, visitatoriListId);

      // Flagga il visitatore come video visto
      if (pendingTutorial.visitatore.itemId) {
        await sharepointService.updateVisitatore(pendingTutorial.visitatore.itemId, { VideoTutorialVisto: true });
      }

      // Apri il passo destinazione
      openDestinationModal(pendingTutorial.accessoId, {
        ...pendingTutorial.visitatore,
        videoTutorialSeen: true,
      });

      closeTutorialModal();
    } catch (error) {
      console.error("Errore salvataggio tutorial:", error);
      showStatus("error", t("status.tutorialSaveError"));
    } finally {
      setTutorialLoading(false);
    }
  }, [accounts, closeTutorialModal, instance, openDestinationModal, pendingTutorial, showStatus]);

  const handleDestinationChoice = useCallback(
    async (destinazione: string) => {
      if (!pendingDestination || !accounts.length) {
        showStatus("error", t("status.sessionNotAuth"));
        return;
      }

      setDestinationLoading(true);
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        });

        const accessiService = new AccessiService(
          tokenResponse.accessToken,
          import.meta.env.VITE_SHAREPOINT_SITE_ID,
          import.meta.env.VITE_ACCESSI_LIST_ID,
          import.meta.env.VITE_SHAREPOINT_LIST_ID
        );

        await accessiService.updatePercorsoDestinazione(pendingDestination.accessoId, destinazione);

        const fullName = `${pendingDestination.visitatore?.nome || ""} ${pendingDestination.visitatore?.cognome || ""}`.trim();
        const message = `Percorso impostato${fullName ? ` per ${fullName}` : ""}: ${destinazione}. Ricorda di effettuare il check-out in uscita!`;
        showStatus("success", message, 4200, t("status.destinationSaveSuccess"));
        closeDestinationModal();
      } catch (error) {
        console.error("Errore salvataggio percorso:", error);
        showStatus("error", t("status.destinationSaveError"));
      } finally {
        setDestinationLoading(false);
        setViewMode("home");
        setLoading(null);
      }
    },
    [accounts, closeDestinationModal, instance, pendingDestination, showStatus]
  );

  const handleScan = useCallback(
    async (raw: any) => {
      if (scanLockRef.current || scannerProcessing) return;

      const code = typeof raw === "string" ? raw.trim() : raw?.data?.trim?.() || raw?.data || "";
      if (!code) return;

      const now = Date.now();
      if (lastScanRef.current && lastScanRef.current.code === code && now - lastScanRef.current.ts < 2200) {
        return; // ignore rapid duplicate reads of the same QR
      }

      scanLockRef.current = true;
      setScannerProcessing(true);
      let handledSuccess = false;
      try {
        if (!accounts.length || !scannerAction) {
          setScannerState("error");
          setScannerMessage(t("scanner.sessionExpired"));
          triggerFeedback("error");
          return;
        }

        const tokenResponse = await instance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        });

        const accessToken = tokenResponse.accessToken;
        const siteId = import.meta.env.VITE_SHAREPOINT_SITE_ID;
        const accessiListId = import.meta.env.VITE_ACCESSI_LIST_ID;
        const visitatoriListId = import.meta.env.VITE_SHAREPOINT_LIST_ID;

        // Rilettura lista visitatori per evitare dati obsoleti (es. visitatore eliminato)
        const sharepointService = new SharePointService(accessToken, siteId, visitatoriListId);
        const freshVisitatori = await sharepointService.getVisitatori();
        const normalizedVisitatori = normalizeVisitatori(freshVisitatori);

        setVisitatori(normalizedVisitatori.filter((v) => v.idVisitatore));

        const visitatore = normalizedVisitatori.find((v) => v.idVisitatore === code);
        if (!visitatore) {
          const message = t("scanner.invalidQr");
          setScannerState("error");
          setScannerMessage(message);
          showStatus("error", message, 4500);
          triggerFeedback("error");
          setLoading(null);
          closeScanner();
          return;
        }

        const accessiService = new AccessiService(accessToken, siteId, accessiListId, visitatoriListId);
        let ultimoPercorso = "";

        if (scannerAction === "uscita") {
          const ultimoAccesso = await accessiService.getUltimoAccesso(visitatore.idVisitatore);
          const ultimaAzione = ultimoAccesso?.fields?.Azione?.toLowerCase?.();
          ultimoPercorso = ultimoAccesso?.fields?.PercorsoDestinazione || "";

          if (!ultimoAccesso || ultimaAzione !== "ingresso") {
            const message = t("status.permissionScanner");
            setScannerState("error");
            setScannerMessage(message);
            showStatus("error", message, 5500);
            triggerFeedback("error");
            setLoading(null);
            closeScanner();
            return;
          }
        }

        const createdAccesso = await accessiService.createAccesso({
          VisitoreID: visitatore.idVisitatore,
          VisitoreNome: visitatore.nome,
          VisitoreCognome: visitatore.cognome,
          Azione: scannerAction === "ingresso" ? "Ingresso" : "Uscita",
          PuntoAccesso: "Kiosk Principale",
          Categoria: visitatore.categoria || "VISITATORE",
          PercorsoDestinazione: scannerAction === "uscita" ? ultimoPercorso : "",
        });

        const msg =
          scannerAction === "uscita"
            ? `Uscita registrata per ${visitatore.nome || ""} ${visitatore.cognome || ""}`.trim()
            : `Accesso consentito per ${visitatore.nome || ""} ${visitatore.cognome || ""}`.trim();
        const successToastTitle = scannerAction === "uscita" ? t("status.successDefault") : t("status.successDefault");
        setScannerState("success");
        setScannerMessage(msg || t("scanner.genericSuccess"));
        showStatus("success", msg || t("scanner.genericSuccess"), 3000, successToastTitle);
        triggerFeedback("success");
        lastScanRef.current = { code, ts: now };
        setLoading(null);
        if (scannerAction === "ingresso" && createdAccesso?.id) {
          if (visitatore.videoTutorialSeen) {
            openDestinationModal(createdAccesso.id, visitatore);
          } else {
            openTutorialModal(createdAccesso.id, visitatore);
          }
        }

        handledSuccess = true;
        await stopScanner();
        setTimeout(() => closeScanner(), 1200);
      } catch (error) {
        console.error("Errore durante la scansione:", error);
        setScannerState("error");
        setScannerMessage(t("scanner.scanError"));
        showStatus("error", t("status.scanErrorTitle"));
        triggerFeedback("error");
      } finally {
        if (!handledSuccess) {
          setScannerProcessing(false);
          scanLockRef.current = false;
        }
      }
    },
    [accounts, closeScanner, instance, openDestinationModal, scannerAction, scannerProcessing, showStatus, stopScanner, triggerFeedback, visitatori]
  );

  const startScanner = useCallback(async () => {
    if (!showScanner || !videoRef.current) return;

    try {
      const scanner = new QrScanner(videoRef.current, (result) => handleScan(result as any), {
        preferredCamera: "environment",
        highlightScanRegion: true,
        returnDetailedScanResult: true,
      });
      scannerRef.current = scanner;
      await scanner.start();
      setScannerState("waiting");
      setScannerMessage(t("scanner.placeQr"));
    } catch (error) {
      console.error("Errore apertura fotocamera:", error);
      setScannerState("error");
      setScannerMessage(t("scanner.cameraError"));
    }
  }, [handleScan, showScanner]);

  useEffect(() => {
    if (showScanner) {
      startScanner();
    }

    return () => {
      stopScanner();
    };
  }, [showScanner, startScanner, stopScanner]);

  useEffect(() => {
    if (!showScanner) return;
    if (scannerState === "success" || scannerState === "error") {
      const timer = setTimeout(() => closeScanner(), scannerState === "error" ? 3000 : 1500);
      return () => clearTimeout(timer);
    }
  }, [scannerState, showScanner, closeScanner]);

  const handleEmailAuthAction = (action: ActionType) => {
    if (visitatoriAccessDenied) {
      showStatus("error", "Permessi insufficienti per accedere alla lista visitatori");
      return;
    }
    setEmailAuthAction(action);
    setShowEmailAuth(true);
    setEmailAuthStep("email");
    setEmailAuthInput("");
    setOtpInput("");
    setEmailAuthError("");
    setGeneratedOtp("");
    setLoading(action);
  };

  const handleSendCode = async () => {
    if (!emailAuthInput.trim()) {
      setEmailAuthError("Inserisci un'email valida");
      return;
    }
    setEmailAuthLoading(true);
    setEmailAuthError("");
    try {
      if (!accounts.length) throw new Error("Sessione non autenticata");

      const tokenResponse = await instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });

      const sharepointService = new SharePointService(tokenResponse.accessToken, import.meta.env.VITE_SHAREPOINT_SITE_ID, import.meta.env.VITE_SHAREPOINT_LIST_ID);
      const freshVisitatori = await sharepointService.getVisitatori();
      const normalizedVisitatori = normalizeVisitatori(freshVisitatori);
      setVisitatori(normalizedVisitatori.filter((v) => v.idVisitatore));

      const lookupEmail = emailAuthInput.trim().toLowerCase();
      const visitatore = normalizedVisitatori.find((v) => (v.email || "").toLowerCase() === lookupEmail);

      if (!visitatore) {
        setEmailAuthError("Email non trovata tra i visitatori registrati.");
        return;
      }

      // Generate OTP
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(code);
      
      // Call Power Automate to send OTP email
      await callPowerAutomate({
        action: "otp",
        idVisitatore: visitatore.idVisitatore,
        nome: visitatore.nome,
        cognome: visitatore.cognome,
        email: visitatore.email,
        otpCode: code,
        language: currentLang,
        source: "totem",
      });
      
      setEmailAuthStep("otp");
    } catch (error: any) {
      console.error("Errore invio codice:", error);
      setEmailAuthError(error?.message || t("status.errorDefault"));
    } finally {
      setEmailAuthLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (otpInput !== generatedOtp) {
      setEmailAuthError(t("status.invalidQrTitle"));
      return;
    }
    
    setEmailAuthLoading(true);
    try {
      // Find visitor again
      const lookupEmail = emailAuthInput.trim().toLowerCase();
      const visitatore = visitatori.find((v) => (v.email || "").toLowerCase() === lookupEmail);
      
      if (!visitatore) {
        throw new Error(t("scanner.invalidQr"));
      }

      const tokenResponse = await instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });
      
      const accessiService = new AccessiService(tokenResponse.accessToken, import.meta.env.VITE_SHAREPOINT_SITE_ID, import.meta.env.VITE_ACCESSI_LIST_ID, import.meta.env.VITE_SHAREPOINT_LIST_ID);
      let ultimoPercorso = "";

      if (emailAuthAction === "uscita") {
        const ultimoAccesso = await accessiService.getUltimoAccesso(visitatore.idVisitatore);
        const ultimaAzione = ultimoAccesso?.fields?.Azione?.toLowerCase?.();
        ultimoPercorso = ultimoAccesso?.fields?.PercorsoDestinazione || "";

        if (!ultimoAccesso || ultimaAzione !== "ingresso") {
          throw new Error(t("status.permissionScanner"));
        }
      }

      const createdAccesso = await accessiService.createAccesso({
        VisitoreID: visitatore.idVisitatore,
        VisitoreNome: visitatore.nome,
        VisitoreCognome: visitatore.cognome,
        Azione: emailAuthAction === "ingresso" ? "Ingresso" : "Uscita",
        PuntoAccesso: "Kiosk Principale",
        Categoria: visitatore.categoria || "VISITATORE",
        PercorsoDestinazione: emailAuthAction === "uscita" ? ultimoPercorso : "",
      });

      const msg =
        emailAuthAction === "uscita"
          ? `Uscita registrata per ${visitatore.nome || ""} ${visitatore.cognome || ""}`.trim()
          : `Accesso consentito per ${visitatore.nome || ""} ${visitatore.cognome || ""}`.trim();
      
      showStatus("success", msg, 3000, emailAuthAction === "uscita" ? t("status.successDefault") : t("status.successDefault"));
      if (emailAuthAction === "ingresso" && createdAccesso?.id) {
        if (visitatore.videoTutorialSeen) {
          openDestinationModal(createdAccesso.id, visitatore);
        } else {
          openTutorialModal(createdAccesso.id, visitatore);
        }
      }

      setShowEmailAuth(false);
      setLoading(null);
      setViewMode("home");
    } catch (error: any) {
      console.error("Errore verifica codice:", error);
      setEmailAuthError(error?.message || t("status.errorDefault"));
    } finally {
      setEmailAuthLoading(false);
    }
  };

  const handleAction = (action: ActionType) => {
    if (visitatoriAccessDenied) {
      showStatus("error", t("status.permissionScanner"));
      return;
    }

    if (authMode === "EMAIL") {
      handleEmailAuthAction(action);
    } else {
      setScannerAction(action);
      setScannerState("waiting");
      setScannerMessage(action === "uscita" ? t("scanner.modalTitleExit") : t("scanner.modalTitleEntry"));
      setShowScanner(true);
      setLoading(action);
    }
  };

  const resetOnboardingForm = (mode: "new" | "resend" = "new") => {
    setObNome("");
    setObCognome("");
    setObEmail("");
    setObAzienda("");
    setObCategoria("VISITATORE");
    setObEnteRiferimento("");
    setObProgetto("");
    setObCommessa("");
    setObAttivita("");
    setObError("");
    setObValidationError("");
    setObAcceptedTerms(false);
    setShowPrivacyViewer(false);
    setOnboardingMode(mode);
  };

  const handleOnboarding = async () => {
    setObLoading(true);
    try {
      if (!accounts.length) throw new Error("Sessione non autenticata");
      setObError("");
      setObValidationError("");

      if (onboardingMode === "new" && !obAcceptedTerms) {
        showStatus("error", t("status.errorDefault"));
        return;
      }

      if (
        onboardingMode === "new" &&
        (!obNome.trim() || !obCognome.trim() || !obAzienda.trim() || !obEmail.trim())
      ) {
        const message = t("status.errorDefault");
        setObValidationError(message);
        setObError(obEmail.trim() ? "" : t("status.errorDefault"));
        showStatus("error", message);
        return;
      }

      if (!obEmail.trim()) {
        setObError(t("status.errorDefault"));
        setObValidationError(t("status.errorDefault"));
        showStatus("error", t("status.errorDefault"));
        return;
      }

      const tokenResponse = await instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });

      const accessToken = tokenResponse.accessToken;
      const siteId = import.meta.env.VITE_SHAREPOINT_SITE_ID;
      const visitatoriListId = import.meta.env.VITE_SHAREPOINT_LIST_ID;
      const sharepointService = new SharePointService(accessToken, siteId, visitatoriListId);

      if (onboardingMode === "new") {
        const latest = await sharepointService.getVisitatori();
        const normalizedLatest = normalizeVisitatori(latest).filter((v) => v.idVisitatore);
        setVisitatori(normalizedLatest);

        const lookupEmail = obEmail.trim().toLowerCase();
        const alreadyExists = normalizedLatest.some((v) => (v.email || "").toLowerCase() === lookupEmail);
        if (alreadyExists) {
          const message = "Un utente con questa email risulta già registrato. Usa il reinvio del QR per riceverlo di nuovo alla tua email.";
          setObError(message);
          showStatus("error", message, 4500, "Utente già registrato");
          setOnboardingMode("resend");
          return;
        }

        const nuovoId = `VIS-${Date.now()}`;
        
        // Prepara i dati del visitatore - NON inviare stringhe vuote per campi opzionali
        const visitatoreData: any = {
          Title: nuovoId,
          Nome: obNome.trim(),
          Cognome: obCognome.trim(),
          Email: obEmail.trim(),
          Azienda: obAzienda.trim(),
          Stato: "Attivo",
          Categoria: obCategoria || "Visitatore",
        };

        // Aggiungi campi ispettore solo se valorizzati
        if (obCategoria === "Ispettore") {
          if (obEnteRiferimento.trim()) visitatoreData.EnteRiferimento = obEnteRiferimento.trim();
          if (obProgetto.trim()) visitatoreData.Progetto = obProgetto.trim();
          if (obCommessa.trim()) visitatoreData.Commessa = obCommessa.trim();
          if (obAttivita.trim()) visitatoreData.Attivita = obAttivita.trim();
        }

        console.log("📝 [handleOnboarding] Creazione visitatore con dati:", visitatoreData);
        
        try {
          await sharepointService.createVisitatore(visitatoreData);
        } catch (createError: any) {
          console.error("❌ [handleOnboarding] Errore creazione visitatore:", createError);
          
          // Messaggio user-friendly
          const userMessage = "Errore durante la registrazione. Verifica la console per dettagli tecnici.";
          setObError(userMessage);
          showStatus("error", userMessage, 5000, "Errore Registrazione");
          return;
        }
        await callPowerAutomate({
          action: "send",
          idVisitatore: nuovoId,
          nome: obNome.trim(),
          cognome: obCognome.trim(),
          email: obEmail.trim(),
          azienda: obAzienda.trim(),
          qrCode: nuovoId,
          puntoAccesso: "Kiosk Principale",
          categoria: obCategoria || "Visitatore",
          enteRiferimento: obCategoria === "Ispettore" ? obEnteRiferimento.trim() : "",
          progetto: obCategoria === "Ispettore" ? obProgetto.trim() : "",
          commessa: obCategoria === "Ispettore" ? obCommessa.trim() : "",
          attivita: obCategoria === "Ispettore" ? obAttivita.trim() : "",
          language: "it",
          source: "totem",
        });

        showStatus("success", "Visitatore creato e QR inviato", 3000, "Visitatore creato");
        loadVisitatori();
      } else {
        const lookupEmail = obEmail.trim().toLowerCase();
        const target = visitatori.find((v) => (v.email || "").toLowerCase() === lookupEmail);

        if (!target) {
          setObError("Email non trovata tra i visitatori registrati");
          showStatus("error", "Visitatore non trovato per reinvio");
          return;
        }

        await callPowerAutomate({
          action: "resend",
          idVisitatore: target.idVisitatore,
          nome: target.nome,
          cognome: target.cognome,
          email: obEmail.trim(),
          azienda: target.azienda,
          qrCode: target.idVisitatore,
          puntoAccesso: "Kiosk Principale",
          categoria: target.categoria || "VISITATORE",
          enteRiferimento: target.enteRiferimento || "",
          progetto: target.progetto || "",
          commessa: target.commessa || "",
          attivita: target.attivita || "",
          language: "it",
          source: "totem",
        });

        showStatus("success", "QR reinviato via email", 3000, "QR reinviato");
      }

      setShowOnboarding(false);
      resetOnboardingForm();
    } catch (error: any) {
      console.error("Errore onboarding:", error);
      showStatus("error", error?.message || "Errore onboarding");
    } finally {
      setObLoading(false);
    }
  };

  useEffect(() => {
    loadVisitatori();
  }, [loadVisitatori]);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (status !== "idle") {
      const timer = setTimeout(() => {
        setStatus("idle");
        setStatusMessage("");
      }, statusTimeout);
      return () => clearTimeout(timer);
    }
  }, [status, statusTimeout]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const isSuccess = scannerState === "success";
  const isError = scannerState === "error";

  const isEmailAuth = authMode === "EMAIL";
  const isUscita = scannerAction === "uscita";
  const modalTitle = isUscita ? t("scanner.modalTitleExit") : t("scanner.modalTitleEntry");
  const modalSubtitle = isUscita ? t("scanner.modalSubtitleExit") : t("scanner.modalSubtitleEntry");
  const successTitle = isUscita ? t("scanner.successTitleExit") : t("scanner.successTitleEntry");
  const onboardingTitle = onboardingMode === "resend" ? t("onboarding.resendQr") : t("onboarding.title");
  const categorieOptions = ["Visitatore", "Ispettore", "Consulente", "Fornitore"];
  const disableOnboardingPrimary = obLoading || (onboardingMode === "new" && !obAcceptedTerms);
  const isCategoriaIspettore = obCategoria === "Ispettore";
  const ingressoIcon = "/imgs/icons/ingresso_icon.png";
  const uscitaIcon = "/imgs/icons/uscita_icon.png";
  const clockLocale = currentLang === "en" ? "en-GB" : "it-IT";
  const homeNewTitle = isEmailAuth ? t("home.newTitleEmail") : t("home.newTitleQr");
  const homeNewSubtitle = isEmailAuth ? t("home.newSubtitleEmail") : t("home.newSubtitleQr");
  const homeListLast = isEmailAuth ? t("home.listLastEmail") : t("home.listLastQr");
  const homeRegCta = isEmailAuth ? t("home.regCtaEmail") : t("home.regCtaQr");
  const homeResendCta = isEmailAuth ? t("home.resendCtaEmail") : t("home.resendCtaQr");
  const homeRegisteredTitle = isEmailAuth ? t("home.registeredTitleEmail") : t("home.registeredTitleQr");
  const homeRegisteredSubtitle = isEmailAuth ? t("home.registeredSubtitleEmail") : t("home.registeredSubtitleQr");
  const homeScanCta = isEmailAuth ? t("home.scanCtaEmail") : t("home.scanCtaQr");
  const helpSteps = t(authMode === "EMAIL" ? "help.stepsEmail" : "help.stepsQr", {
    returnObjects: true,
  }) as { title: string; text: string }[];
  const homeGraphicSrc = isEmailAuth ? "/imgs/icons/otp_icon.png" : "/imgs/icons/qr_code_scan_icon.gif";
  const homeGraphicAlt = isEmailAuth ? "Icona OTP" : "Icona animata scansione QR";
  const destinationOptions = t("destination.options", { returnObjects: true }) as string[];
  const tutorialVideoSrc = "/video/tutorial/Istruzioni_di_sicurezza_visitatori.mp4";
  // const selectedPrivacyUrl = ... (Removed, using state)

  return (
    <div style={styles.screen}>
      <div style={styles.frame}>
        <div style={styles.headerRow}>
          <div style={styles.logoBlock}>
            <img src="/imgs/logo.png" alt="Company Logo" style={styles.logoImage} />
          </div>
          <div style={styles.titleBlock}>
            <h1 style={styles.title}>Welcome Desk Visitatori</h1>
          <p style={styles.subtitle}>{`${t("brand.title")} - ${t("modes.ingresso")} & ${t("modes.uscita")}`}</p>
            {visitatoriAccessDenied && (
              <div style={styles.alertBadge}>Permessi insufficienti per leggere l'elenco visitatori</div>
            )}
          </div>
          <button
            style={{
              ...styles.adminButton,
              ...(canAccessAdmin ? {} : styles.adminButtonDisabled),
            }}
            onClick={canAccessAdmin ? onAdminAccess : undefined}
            title={canAccessAdmin ? t("admin.tooltipAllowed") : t("admin.tooltipDenied")}
            aria-label={t("admin.buttonLabel")}
            aria-disabled={!canAccessAdmin}
            disabled={!canAccessAdmin}
          >
            <div style={styles.adminIconBadge} aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="7" y="11" width="10" height="8" rx="2" />
                <path d="M9.5 11V8.5a2.5 2.5 0 0 1 5 0V11" />
                <path d="M12 14v2.5" />
              </svg>
            </div>
            <div style={styles.adminTextBlock}>
              <span style={styles.adminLabel}>{t("admin.buttonLabel")}</span>
              <span style={styles.adminSubtitle}>{t("admin.buttonSubtitle")}</span>
            </div>
            <div style={styles.adminChevron} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M10 7l5 5-5 5" />
              </svg>
            </div>
          </button>
        </div>

        <div style={styles.bodyArea}>
          {viewMode === "home" ? (
            <div style={styles.homeGrid}>
              <div style={{ ...styles.homeCard, ...styles.homeCardPrimary }}>
                <div style={styles.homeBadge}>{t("home.newBadge")}</div>
                <div style={styles.homeTitle}>{homeNewTitle}</div>
                <div style={styles.homeSubtitle}>{homeNewSubtitle}</div>
                <ul style={styles.homeList}>
                  <li>{isEmailAuth ? t("home.listNameEmail") : t("home.listNameQr")}</li>
                  <li>{t("home.listId")}</li>
                  <li>{homeListLast}</li>
                </ul>
                <div
                  style={
                    isEmailAuth
                      ? { ...styles.homeActions, justifyContent: "flex-end" }
                      : styles.homeActions
                  }
                >
                  <button
                    style={styles.primaryButtonLarge}
                    onClick={() => {
                      resetOnboardingForm("new");
                      setShowOnboarding(true);
                    }}
                  >
                    {homeRegCta}
                  </button>
                  {!isEmailAuth && (
                    <button
                      style={{ ...styles.secondaryButton, ...styles.secondaryButtonLarge, width: "100%" }}
                      onClick={() => {
                        resetOnboardingForm("resend");
                        setShowOnboarding(true);
                      }}
                    >
                      {homeResendCta}
                    </button>
                  )}
                </div>
              </div>

              <div style={{ ...styles.homeCard, ...styles.homeCardScan }}>
                <div style={styles.homeTopRow}>
                  <div style={styles.homeBadgeAlt}>{t("home.registeredBadge")}</div>
                  <div style={styles.homePreviewTop}>
                    <div style={styles.previewPill}>{t("modes.ingresso")}</div>
                    <div style={styles.previewPillDanger}>{t("modes.uscita")}</div>
                  </div>
                </div>
                <div style={styles.homeTitle}>{homeRegisteredTitle}</div>
                <div style={styles.homeSubtitle}>{homeRegisteredSubtitle}</div>
                <div style={styles.homeGraphic}>
                  <img
                    src={homeGraphicSrc}
                    alt={homeGraphicAlt}
                    style={styles.homeQrImage}
                  />
                </div>
                <div style={{ ...styles.homeActions, ...styles.homeActionsScan }}>
                  <button style={{ ...styles.primaryButtonLarge, ...styles.primaryButtonTall, ...styles.primaryButtonScan }} onClick={goToScanView}>
                    {homeScanCta}
                  </button>
                </div>
              </div>
            </div>
          ) : (
              <div style={styles.panelsColumn}>
              <div style={styles.scanHeaderBar}>
                <button style={styles.backButton} onClick={goToHome}>
                  {t("home.backToStart")}
                </button>
              </div>
              <div style={styles.panelsRow}>
              <div style={{ ...styles.panel, ...styles.panelIngresso }}>
                <div style={styles.panelHeader}>
                  <div style={styles.panelTopRow}>
                    <div style={styles.panelBadgeIngresso}>{t("modes.ingresso")}</div>
                    <div style={styles.panelModeChip}>
                      {authMode === "EMAIL" ? t("modes.emailOtp") : t("modes.qr")}
                    </div>
                  </div>
                  <div style={styles.panelTitleRow}>
                    <div>
                      <div style={styles.panelTitle}>{t("panels.ingressoTitle")}</div>
                      <div style={styles.panelSubtitle}>
                        {authMode === "EMAIL" ? t("panels.ingressoSubtitleEmail") : t("panels.ingressoSubtitleQr")}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={styles.qrBlock}>
                  <img
                    src={ingressoIcon}
                    alt="Icona ingresso"
                    style={styles.qrImage}
                  />
                </div>

                  <button
                    style={{ ...styles.ctaButton, ...styles.ctaIngresso, ...(loading ? styles.ctaDisabled : {}) }}
                    onClick={() => handleAction("ingresso")}
                    disabled={loading !== null}
                  >
                    {loading === "ingresso" && showScanner
                      ? t("panels.scannerActive")
                      : authMode === "EMAIL"
                        ? t("panels.ctaIngressoEmail")
                        : t("panels.ctaIngressoQr")}
                  </button>
                </div>

              <div style={{ ...styles.panel, ...styles.panelUscita }}>
                <div style={styles.panelHeader}>
                  <div style={styles.panelTopRow}>
                    <div style={styles.panelBadgeUscita}>{t("modes.uscita")}</div>
                    <div style={styles.panelModeChip}>
                      {authMode === "EMAIL" ? t("modes.emailOtp") : t("modes.qr")}
                    </div>
                  </div>
                  <div style={styles.panelTitleRow}>
                    <div>
                      <div style={styles.panelTitle}>{t("panels.uscitaTitle")}</div>
                      <div style={styles.panelSubtitle}>
                        {authMode === "EMAIL" ? t("panels.uscitaSubtitleEmail") : t("panels.uscitaSubtitleQr")}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={styles.qrBlock}>
                  <img
                    src={uscitaIcon}
                    alt="Icona uscita"
                    style={styles.qrImage}
                  />
                </div>

                  <button
                    style={{ ...styles.ctaButton, ...styles.ctaUscita, ...(loading ? styles.ctaDisabled : {}) }}
                    onClick={() => handleAction("uscita")}
                    disabled={loading !== null}
                  >
                    {loading === "uscita" && showScanner
                      ? t("panels.scannerActive")
                      : authMode === "EMAIL"
                        ? t("panels.ctaUscitaEmail")
                        : t("panels.ctaUscitaQr")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={styles.footerRow}>
          <div style={styles.footerLeft}>
            <div style={styles.languageSwitcher} aria-label="Lingua">
              <button
                style={{
                  ...styles.langButton,
                  ...(currentLang === "it" ? styles.langButtonActive : {}),
                }}
                onClick={() => changeLanguage("it")}
                aria-label="Italiano"
                aria-pressed={currentLang === "it"}
              >
                <img src="/imgs/icons/italy.png" alt="Italiano" style={styles.langFlag} />
                {currentLang === "it" && <span style={styles.langActiveBar} aria-hidden />}
              </button>
              <button
                style={{
                  ...styles.langButton,
                  ...(currentLang === "en" ? styles.langButtonActive : {}),
                }}
                onClick={() => changeLanguage("en")}
                aria-label="English"
                aria-pressed={currentLang === "en"}
              >
                <img src="/imgs/icons/united-kingdom.png" alt="English" style={styles.langFlag} />
                {currentLang === "en" && <span style={styles.langActiveBar} aria-hidden />}
              </button>
            </div>
          </div>

          <div style={styles.footerActions}>
            <button style={styles.helpButton} onClick={() => setShowHelp(true)}>
              {t("footer.needHelp")}
            </button>
          </div>

          <div style={styles.footerClockWrapper}>
            <div style={styles.clockBlock} aria-label="Ora e data attuali">
              <div style={styles.clockTime}>{now.toLocaleTimeString(clockLocale, { hour: "2-digit", minute: "2-digit" })}</div>
              <div style={styles.clockDate}>{now.toLocaleDateString(clockLocale, { weekday: "short", day: "2-digit", month: "short" })}</div>
            </div>
          </div>
        </div>
      </div>

      {showScanner && (
        <div style={styles.overlay}>
          <div style={styles.overlayContent}>
            <div style={styles.scannerTopRow}>
              <div
                style={{
                  ...styles.scannerPill,
                  ...(isUscita ? styles.scannerPillWarning : styles.scannerPillSuccess),
                }}
              >
                {isUscita ? t("modes.uscita") : t("modes.ingresso")}
              </div>
              <div style={styles.scannerLive}>
                <span style={styles.liveDot} /> {t("scanner.live")}
              </div>
            </div>

              <div style={styles.scannerHeaderBlock}>
              <div style={styles.scannerHeader}>{t("scanner.header")}</div>
              <div style={styles.scannerTitle}>{modalTitle}</div>
              <div style={styles.scannerSubtitle}>{modalSubtitle}</div>
            </div>

            <div style={styles.scannerLayout}>
              <div style={styles.scannerLeft}>
                <div style={styles.scannerFrameWrapper}>
                  <div style={styles.scannerFrame}>
                    <video ref={videoRef} style={styles.scannerVideo} muted autoPlay playsInline />
                    <div style={{ ...styles.scannerCorner, ...styles.cornerTopLeft }} />
                    <div style={{ ...styles.scannerCorner, ...styles.cornerTopRight }} />
                    <div style={{ ...styles.scannerCorner, ...styles.cornerBottomLeft }} />
                    <div style={{ ...styles.scannerCorner, ...styles.cornerBottomRight }} />
                    <div style={styles.scanOverlayLabel}>{t("scanner.scanArea")}</div>
                  </div>
                </div>
                <div style={styles.captureHint}>{t("scanner.hintDistance")}</div>
              </div>

              <div style={styles.scannerRight}>
                <div
                  style={{
                    ...styles.stateCard,
                    ...(isSuccess ? styles.stateSuccess : isError ? styles.stateError : styles.stateWaiting),
                  }}
                >
                  <div style={styles.stateIcon}>{isSuccess ? "✔️" : isError ? "✖️" : "⌛"}</div>
                  <div style={styles.stateTextWrap}>
                    <div style={styles.stateTitle}>
                      {isSuccess ? successTitle : isError ? t("scanner.stateInvalid") : t("scanner.wait")}
                    </div>
                    <div style={styles.stateSubtitle}>{scannerMessage}</div>
                  </div>
                </div>

                <div style={styles.stepsCard}>
                  <div style={styles.stepsHeader}>{t("scanner.stepsTitle")}</div>
                  <ul style={styles.stepList}>
                    {(t("scanner.steps", { returnObjects: true }) as unknown as string[] | undefined)?.map(
                      (step, index) => (
                        <li style={styles.stepItem} key={`${step}-${index}`}>
                          <span style={styles.stepIndex}>{index + 1}</span>
                          <div style={styles.stepBody}>{step}</div>
                        </li>
                      )
                    )}
                  </ul>
                </div>

                <div style={styles.tipsCard}>
                  <div style={styles.tipBadge}>{isUscita ? t("modes.uscita") : t("modes.ingresso")}</div>
                  <div style={styles.tipText}>{t("scanner.tipText")}</div>
                </div>

                <div style={styles.scannerActions}>
                  <button style={styles.closeButton} onClick={closeScanner} disabled={scannerProcessing}>
                    {t("scanner.close")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDestinationModal && pendingDestination && (
        <div style={styles.overlay}>
          <div style={styles.destinationContent}>
            <div style={styles.destinationTopRow}>
              <div style={styles.destinationPill}>Ingresso registrato</div>
              <button
                style={styles.destinationClose}
                onClick={closeDestinationModal}
                disabled={destinationLoading}
              >
                Chiudi
              </button>
            </div>

            <div style={styles.destinationHeaderText}>{t("destination.title")}</div>
            <div style={styles.destinationSubtext}>{t("destination.subtitle")}</div>

            <div style={styles.destinationVisitorRow}>
              <div style={styles.destinationAvatar}>
                {(pendingDestination.visitatore?.nome?.[0] || t("destination.visitorFallback")[0] || "O").toUpperCase()}
              </div>
              <div>
                <div style={styles.destinationName}>
                  {`${pendingDestination.visitatore?.nome || ""} ${pendingDestination.visitatore?.cognome || ""}`.trim() ||
                    t("destination.visitorFallback")}
                </div>
                <div style={styles.destinationHint}>{t("destination.hint")}</div>
              </div>
            </div>

            <div style={styles.destinationGrid}>
              {destinationOptions.map((option) => (
                <button
                  key={option}
                  style={{
                    ...styles.destinationCard,
                    ...(destinationLoading ? styles.destinationCardDisabled : {}),
                  }}
                  onClick={() => handleDestinationChoice(option)}
                  disabled={destinationLoading}
                >
                  <div style={styles.destinationCardTitle}>{option}</div>
                  <div style={styles.destinationCardArrow}>⟶</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showTutorialModal && pendingTutorial && (
        <div style={styles.overlay}>
          <div style={styles.tutorialContent}>
              <div style={styles.tutorialTopRow}>
              <div style={styles.tutorialPill}>{t("scanner.tutorialTitle")}</div>
              <button
                style={styles.destinationClose}
                onClick={closeTutorialModal}
                disabled={tutorialLoading}
              >
                Chiudi
              </button>
            </div>

            <div style={styles.tutorialHeader}>
              <div style={styles.tutorialTitle}>{t("scanner.tutorialTitle")}</div>
              <div style={styles.tutorialSubtitle}>{t("scanner.tutorialSubtitle")}</div>
            </div>

            <div style={styles.tutorialVideoWrapper}>
              <video
                style={styles.tutorialVideo}
                src={tutorialVideoSrc}
                autoPlay
                controls
                controlsList="nodownload"
                playsInline
                preload="auto"
              />
            </div>

            <div style={styles.tutorialActions}>
              <button
                style={{
                  ...styles.primaryButton,
                  minWidth: "180px",
                  ...(tutorialLoading ? styles.primaryButtonDisabled : {}),
                }}
                onClick={handleTutorialAcknowledge}
                disabled={tutorialLoading}
              >
                {tutorialLoading ? t("onboarding.loadingGeneric") : t("scanner.tutorialCta")}
              </button>
              <div style={styles.tutorialHint}>
                {t("scanner.tutorialHint")}
              </div>
            </div>
          </div>
        </div>
      )}

      {showEmailAuth && (
        <div style={styles.overlay}>
          <div style={styles.onboardingContent}>
            <div style={styles.onboardingTopRow}>
              <div style={styles.brandBlock}>
                <div style={styles.brandIcon}>◎</div>
                <div>
                  <div style={styles.brandTitle}>{t("brand.title")}</div>
                  <div style={styles.brandSubtitle}>{t("brand.subtitle")}</div>
                </div>
              </div>
              <div style={styles.modePill}>
                {emailAuthAction === "uscita" ? t("modes.uscita") : t("modes.ingresso")}
              </div>
            </div>

            <div style={styles.onboardingHero}>
              <div style={styles.heroTitle}>
                {emailAuthAction === "uscita" ? t("emailAuth.uscita") : t("emailAuth.ingresso")}
              </div>
              <div style={styles.heroSubtitle}>
                {emailAuthStep === "email" ? t("emailAuth.emailStepTitle") : t("emailAuth.otpStepTitle")}
              </div>
            </div>

            <div style={styles.onboardingBody}>
                {emailAuthStep === "email" ? (
                  <div style={styles.formGrid}>
                    <div style={styles.formField}>
                    <label style={styles.formLabel}>{t("onboarding.email")}</label>
                    <input
                      style={styles.formInput}
                      value={emailAuthInput}
                      onChange={(e) => setEmailAuthInput(e.target.value)}
                      placeholder="nome@azienda.com"
                    />
                    {emailAuthError && <div style={styles.errorText}>{emailAuthError}</div>}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
                      <button
                        style={{ ...styles.primaryButton, padding: "0.8rem 1.5rem", fontSize: "1rem" }}
                        onClick={handleSendCode}
                        disabled={emailAuthLoading}
                      >
                        {emailAuthLoading ? t("onboarding.loadingGeneric") : t("emailAuth.sendCode")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={styles.formGrid}>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>{t("emailAuth.otpStepTitle")}</label>
                    <input
                      style={{
                        ...styles.formInput,
                        textAlign: "center",
                        letterSpacing: "0.5rem",
                        fontSize: "1.2rem",
                      }}
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value)}
                      placeholder={t("emailAuth.otpPlaceholder")}
                      maxLength={6}
                    />
                    {emailAuthError && <div style={styles.errorText}>{emailAuthError}</div>}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
                      <button
                        style={styles.primaryButton}
                        onClick={handleVerifyCode}
                        disabled={emailAuthLoading}
                      >
                        {emailAuthLoading ? t("onboarding.loadingGeneric") : t("emailAuth.verifyAccess")}
                      </button>
                      <button
                        style={{
                          ...styles.secondaryButton,
                          border: "none",
                          background: "transparent",
                          color: "#555",
                        }}
                        onClick={() => setEmailAuthStep("email")}
                      >
                        {t("emailAuth.back")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={styles.onboardingActions}>
              <button
                style={styles.closeButton}
                onClick={() => {
                  setShowEmailAuth(false);
                  setLoading(null);
                }}
              >
                {t("emailAuth.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div style={styles.overlay}>
          <div style={styles.helpContent}>
            <div style={styles.helpHeader}>{t("help.header")}</div>
            <div style={styles.helpTitle}>{t("help.title")}</div>
            <div style={styles.helpGrid}>
              {helpSteps?.map((step, idx) => (
                <div style={styles.helpCard} key={`${step.title}-${idx}`}>
                  <div style={styles.helpBadge}>{idx + 1}</div>
                  <div style={styles.helpCardTitle}>{step.title}</div>
                  <div style={styles.helpText}>{step.text}</div>
                </div>
              ))}
            </div>
            <div style={styles.helpActions}>
              <button style={styles.closeButton} onClick={() => setShowHelp(false)}>
                {t("help.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showOnboarding && (
        <div style={styles.overlay}>
          <div style={styles.onboardingContent}>
            <div style={styles.onboardingTopRow}>
              <div style={styles.brandBlock}>
                <div style={styles.brandIcon}>◎</div>
                <div>
                  <div style={styles.brandTitle}>{t("brand.title")}</div>
                  <div style={styles.brandSubtitle}>{t("brand.subtitle")}</div>
                </div>
              </div>
              <div style={styles.modePill}>{onboardingTitle}</div>
            </div>

            <div style={styles.onboardingHero}>
              <div style={styles.heroTitle}>{t("onboarding.title")}</div>
              <div style={styles.heroSubtitle}>
                {onboardingMode === "new"
                  ? authMode === "EMAIL"
                    ? t("onboarding.newSubtitleEmail")
                    : t("onboarding.newSubtitleQr")
                  : authMode === "EMAIL"
                    ? t("onboarding.resendSubtitleEmail")
                    : t("onboarding.resendSubtitleQr")}
              </div>
            </div>

            <div style={styles.onboardingBody}>
              {onboardingMode === "new" ? (
                <div style={styles.formGrid}>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>
                      {t("onboarding.nome")} <span style={styles.requiredMark}>*</span>
                    </label>
                    <input
                      style={{ ...styles.formInput, ...styles.requiredInput }}
                      value={obNome}
                      onChange={(e) => setObNome(e.target.value)}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>
                      {t("onboarding.cognome")} <span style={styles.requiredMark}>*</span>
                    </label>
                    <input
                      style={{ ...styles.formInput, ...styles.requiredInput }}
                      value={obCognome}
                      onChange={(e) => setObCognome(e.target.value)}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>
                      {t("onboarding.email")} <span style={styles.requiredMark}>*</span>
                    </label>
                    <input
                      style={{ ...styles.formInput, ...styles.requiredInput }}
                      value={obEmail}
                      onChange={(e) => setObEmail(e.target.value)}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>
                      {t("onboarding.azienda")} <span style={styles.requiredMark}>*</span>
                    </label>
                    <input
                      style={{ ...styles.formInput, ...styles.requiredInput }}
                      value={obAzienda}
                      onChange={(e) => setObAzienda(e.target.value)}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>{t("onboarding.categoria")}</label>
                    <select
                      style={styles.formInput}
                      value={obCategoria}
                      onChange={(e) => {
                        const value = e.target.value;
                        setObCategoria(value);
                        if (value !== "Ispettore") {
                          setObEnteRiferimento("");
                          setObProgetto("");
                          setObCommessa("");
                          setObAttivita("");
                        }
                      }}
                    >
                      {categorieOptions.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isCategoriaIspettore && (
                    <>
                      <div style={styles.formField}>
                        <label style={styles.formLabel}>{t("onboarding.enteRiferimento")}</label>
                        <input
                          style={styles.formInput}
                          value={obEnteRiferimento}
                          onChange={(e) => setObEnteRiferimento(e.target.value)}
                          placeholder="Ente di riferimento"
                        />
                      </div>
                      <div style={styles.formField}>
                        <label style={styles.formLabel}>{t("onboarding.progetto")}</label>
                        <input
                          style={styles.formInput}
                          value={obProgetto}
                          onChange={(e) => setObProgetto(e.target.value)}
                          placeholder="Progetto"
                        />
                      </div>
                      <div style={styles.formField}>
                        <label style={styles.formLabel}>{t("onboarding.commessa")}</label>
                        <input
                          style={styles.formInput}
                          value={obCommessa}
                          onChange={(e) => setObCommessa(e.target.value)}
                          placeholder="Commessa"
                        />
                      </div>
                      <div style={styles.formField}>
                        <label style={styles.formLabel}>{t("onboarding.attivita")}</label>
                        <input
                          style={styles.formInput}
                          value={obAttivita}
                          onChange={(e) => setObAttivita(e.target.value)}
                          placeholder="Attività"
                        />
                      </div>
                    </>
                  )}
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>{t("onboarding.idVisitatore")}</label>
                    <input
                      style={{ ...styles.formInput, ...styles.inputDisabled }}
                      value={t("onboarding.idHelper")}
                      disabled
                    />
                    <div style={styles.helperText}>{t("onboarding.idHelper")}</div>
                  </div>
                </div>
              ) : (
                <div style={styles.formGrid}>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>
                      Email <span style={styles.requiredMark}>*</span>
                    </label>
                    <input
                      style={{ ...styles.formInput, ...styles.requiredInput }}
                      value={obEmail}
                    onChange={(e) => {
                      setObEmail(e.target.value);
                      if (obError) setObError("");
                    }}
                  />
                  <div style={styles.helperText}>Inserisci l'email per reinviare il QR.</div>
                </div>
              </div>
            )}

              {onboardingMode === "new" && obValidationError && (
                <div style={{ ...styles.errorText, marginTop: "0.25rem" }}>{obValidationError}</div>
              )}

              {onboardingMode === "new" && (
                <label style={styles.termsRow}>
                  <input
                    type="checkbox"
                    checked={obAcceptedTerms}
                    onChange={(e) => {
                      if (e.target.checked) {
                        if (privacyDocs[0]?.file) {
                          setSelectedPrivacyDoc(privacyDocs[0].file);
                        }
                        setShowPrivacyViewer(true);
                        setObAcceptedTerms(false);
                      } else {
                        setObAcceptedTerms(false);
                      }
                    }}
                    style={styles.checkbox}
                  />
                  <span style={styles.termsText}>
                    {t("terms.accept")}
                  </span>
                </label>
              )}
            </div>

            <div style={styles.onboardingActions}>
              <button
                style={styles.closeButton}
                onClick={() => {
                  setShowOnboarding(false);
                  resetOnboardingForm("new");
                }}
                disabled={obLoading}
              >
                {t("onboarding.cancel")}
              </button>
              <button
                style={{
                  ...styles.primaryButton,
                  ...(disableOnboardingPrimary ? styles.primaryButtonDisabled : {}),
                }}
                onClick={handleOnboarding}
                disabled={disableOnboardingPrimary}
              >
                {obLoading
                  ? authMode === "EMAIL"
                    ? t("onboarding.loadingOtp")
                    : t("onboarding.loadingGeneric")
                  : onboardingMode === "new"
                    ? authMode === "EMAIL"
                      ? t("onboarding.registerEnableOtp")
                      : t("onboarding.registerSendQr")
                    : t("onboarding.resendQr")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrivacyViewer && (
        <div style={{ ...styles.overlay, zIndex: 30, padding: "3rem 1.5rem" }}>
          <div style={styles.privacyContent}>
            <div style={styles.privacyTopRow}>
              <div>
                <div style={styles.privacyTitle}>{t("privacy.title")}</div>
                <div style={styles.privacySubtitle}>{t("privacy.subtitle")}</div>
              </div>
            </div>

            <div style={styles.privacyLayout}>
              <div style={styles.privacyList}>
                {privacyDocs.map((doc) => {
                  const isActive = selectedPrivacyDoc === doc.file;
                  return (
                    <button
                      key={doc.file}
                      style={{
                        ...styles.privacyListItem,
                        ...(isActive ? styles.privacyListItemActive : {}),
                      }}
                      onClick={() => setSelectedPrivacyDoc(doc.file)}
                    >
                      <div style={styles.privacyListLabel}>{doc.label}</div>
                    </button>
                  );
                })}
              </div>

              <div style={styles.privacyViewer}>
                {isPrivacyLoading ? (
                  <div style={styles.privacyHelper}>Caricamento documento...</div>
                ) : selectedPrivacyUrl ? (
                  <iframe
                    title={`${t("privacy.title")}: ${selectedPrivacyDoc}`}
                    src={selectedPrivacyUrl}
                    style={styles.privacyIframe}
                  />
                ) : (
                  <div style={styles.privacyHelper}>{t("privacy.helper")}</div>
                )}
              </div>
            </div>

            <div style={styles.privacyActions}>
              <button
                style={styles.closeButton}
                onClick={() => {
                  setShowPrivacyViewer(false);
                  setObAcceptedTerms(false);
                }}
              >
                {t("privacy.closeWithoutAccept")}
              </button>
              <button
                style={styles.primaryButton}
                onClick={() => {
                  setObAcceptedTerms(true);
                  setShowPrivacyViewer(false);
                }}
              >
                {t("privacy.accept")}
              </button>
            </div>
          </div>
        </div>
      )}

      {status !== "idle" && (
        <div
          style={{
            ...styles.toastOverlay,
            ...(status === "success" ? styles.toastOverlaySuccess : styles.toastOverlayError),
          }}
        >
          <div
            style={{
              ...styles.toastCard,
              ...(status === "success" ? styles.toastCardSuccess : styles.toastCardError),
            }}
          >
            <div style={styles.toastIcon}>{status === "success" ? "✅" : "⚠️"}</div>
            <div style={styles.toastText}>
              <div style={styles.toastTitle}>
                {statusTitle || (status === "success" ? "Operazione completata" : "Ops, qualcosa non va")}
              </div>
              <div style={styles.toastMessage}>{statusMessage}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

  const styles: Record<string, React.CSSProperties> = {
  screen: {
    height: "100vh",
    width: "100vw",
    background: "linear-gradient(135deg, #f6fbff 0%, #e7f0fa 35%, #dfe9f5 100%)",
    display: "flex",
    flexDirection: "column",
    padding: "1rem 1.25rem 1.5rem",
  },
  frame: {
    width: "100%",
    maxWidth: "100%",
    height: "100%",
    flex: 1,
    background: "transparent",
    borderRadius: "0",
    boxShadow: "none",
    border: "none",
    padding: "0",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  bodyArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
  },
  logoBlock: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  logoImage: {
    height: "100px",
    width: "auto",
    objectFit: "contain",
    filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.14))",
  },
  titleBlock: {
    textAlign: "center",
    flex: 1,
  },
  title: {
    margin: 0,
    color: "#0f1f3a",
    fontSize: "2.8rem",
    fontWeight: 800,
    letterSpacing: "-0.6px",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  subtitle: {
    margin: "0.25rem 0 0",
    color: "#2c3f55",
    fontSize: "1.2rem",
    fontWeight: 600,
    letterSpacing: "-0.1px",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  languageSwitcher: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
    padding: "0.35rem 0.5rem",
    background: "rgba(255,255,255,0.72)",
    borderRadius: "14px",
    boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
    border: "1px solid rgba(15, 93, 187, 0.08)",
  },
  langButton: {
    border: "none",
    borderRadius: "14px",
    padding: "0.32rem 0.55rem",
    background: "rgba(255,255,255,0.8)",
    cursor: "pointer",
    boxShadow: "0 6px 14px rgba(0,0,0,0.08)",
    transition: "all 0.2s ease",
    outline: "none",
  },
  langButtonActive: {
    border: "1px solid #0f8bff",
    boxShadow: "0 10px 22px rgba(15,139,255,0.2)",
    background: "linear-gradient(180deg, #e8f3ff 0%, #ffffff 85%)",
    transform: "translateY(-1px)",
  },
  langFlag: {
    width: "32px",
    height: "24px",
    objectFit: "cover",
    borderRadius: "7px",
    display: "block",
    boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
  },
  langActiveBar: {
    display: "block",
    height: "3px",
    width: "100%",
    borderRadius: "999px",
    background: "linear-gradient(90deg, #0f8bff 0%, #1fc3a8 100%)",
    marginTop: "0.22rem",
  },
  clockBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.5rem 0.75rem",
    borderRadius: "14px",
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(12,47,75,0.1)",
    boxShadow: "0 12px 24px rgba(0,0,0,0.08)",
    minWidth: "150px",
  },
  clockTime: {
    fontSize: "1.55rem",
    fontWeight: 800,
    letterSpacing: "-0.5px",
    color: "#0f1f3a",
    lineHeight: 1.1,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  clockDate: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "#2c3f55",
    textTransform: "capitalize",
    letterSpacing: "-0.1px",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  alertBadge: {
    marginTop: "0.4rem",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.5rem 0.75rem",
    borderRadius: "10px",
    background: "rgba(239, 68, 68, 0.12)",
    color: "#b91c1c",
    fontWeight: 700,
    fontSize: "0.95rem",
    border: "1px solid rgba(185, 28, 28, 0.2)",
  },
  panelsRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "1.25rem",
    width: "100%",
    alignItems: "stretch",
    flex: 1,
  },
  panelsColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    height: "100%",
  },
  panel: {
    background: "#ffffff",
    borderRadius: "20px",
    border: "1px solid rgba(12,47,75,0.12)",
    padding: "1.35rem 1.35rem 1.1rem",
    boxShadow: "0 16px 36px rgba(12,47,75,0.14), 0 6px 16px rgba(0,0,0,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    position: "relative",
    height: "100%",
    minHeight: "520px",
    justifyContent: "space-between",
  },
  panelIngresso: {
    background: "linear-gradient(155deg, #f4fbf6 0%, #e8f7ed 52%, #def2e5 100%)",
    borderColor: "#b7e4c6",
    boxShadow: "0 20px 44px rgba(30,141,92,0.16), 0 8px 18px rgba(0,0,0,0.08)",
  },
  panelUscita: {
    background: "linear-gradient(155deg, #fff6f6 0%, #ffecec 52%, #ffe0e3 100%)",
    borderColor: "#f5c8ce",
    boxShadow: "0 20px 44px rgba(200,60,60,0.16), 0 8px 18px rgba(0,0,0,0.08)",
  },
  panelHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  panelIcon: {
    fontSize: "3.1rem",
    color: "#0c2f4b",
    textShadow: "0 8px 16px rgba(12,47,75,0.18)",
  },
  panelTitleRow: {
    display: "flex",
    gap: "0.85rem",
    alignItems: "flex-start",
    marginTop: "0.35rem",
  },
  panelTitle: {
    fontSize: "1.65rem",
    fontWeight: 800,
    color: "#10253b",
    letterSpacing: "-0.3px",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    margin: 0,
    lineHeight: 1.1,
  },
  panelSubtitle: {
    fontSize: "1.08rem",
    fontWeight: 650,
    color: "#1e3b53",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    marginTop: "0.35rem",
    lineHeight: 1.4,
  },
  panelTopRow: {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    alignItems: "center",
  },
  panelBadgeIngresso: {
    padding: "0.45rem 0.9rem",
    borderRadius: "999px",
    background: "rgba(33, 150, 83, 0.14)",
    color: "#19683c",
    fontWeight: 850,
    fontSize: "0.95rem",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    boxShadow: "0 8px 18px rgba(33, 150, 83, 0.28), inset 0 1px 0 rgba(255,255,255,0.6)",
  },
  panelBadgeUscita: {
    padding: "0.45rem 0.9rem",
    borderRadius: "999px",
    background: "rgba(200, 60, 60, 0.14)",
    color: "#9a1f1f",
    fontWeight: 850,
    fontSize: "0.95rem",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    boxShadow: "0 8px 18px rgba(200, 60, 60, 0.28), inset 0 1px 0 rgba(255,255,255,0.6)",
  },
  panelModeChip: {
    padding: "0.42rem 0.8rem",
    borderRadius: "12px",
    background: "rgba(12,47,75,0.08)",
    color: "#0f416b",
    fontWeight: 750,
    fontSize: "0.95rem",
    letterSpacing: "0.01em",
    border: "1px solid rgba(12,47,75,0.12)",
    textTransform: "uppercase",
  },
  qrBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.55rem",
    padding: "0.55rem 0.5rem 0.55rem",
    borderRadius: "30px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 26px rgba(12,47,75,0.2)",
    width: "fit-content",
    alignSelf: "center",
  },
  qrImage: {
    width: "230px",
    height: "230px",
    objectFit: "contain",
    filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.16))",
  },
  qrHint: {
    fontSize: "1.05rem",
    color: "#111827",
    fontWeight: 600,
  },
  ctaButton: {
    width: "100%",
    padding: "1.35rem 1.2rem",
    fontSize: "1.2rem",
    fontWeight: 800,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    borderRadius: "12px",
    border: "none",
    color: "white",
    cursor: "pointer",
    boxShadow: "0 14px 26px rgba(0,0,0,0.18)",
    transition: "transform 0.2s, box-shadow 0.2s, opacity 0.2s",
    minHeight: "5.6rem",
  },
  ctaIngresso: {
    background: "linear-gradient(180deg, #33a852 0%, #1f8c3c 100%)",
  },
  ctaUscita: {
    background: "linear-gradient(180deg, #d83b3b 0%, #c12727 100%)",
  },
  ctaDisabled: {
    opacity: 0.65,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  footerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "0.75rem",
    paddingTop: "0.25rem",
    gap: "1rem",
    position: "relative",
    minHeight: "90px",
  },
  footerLeft: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    width: "30%",
    minWidth: "200px",
  },
  homeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "1.35rem",
    width: "100%",
    padding: "0.35rem 0.25rem",
    alignItems: "stretch",
    flex: 1,
    minHeight: 0,
  },
  homeCard: {
    background: "#ffffff",
    borderRadius: "20px",
    border: "1px solid rgba(12,47,75,0.08)",
    boxShadow: "0 16px 34px rgba(12,47,75,0.14), 0 6px 16px rgba(0,0,0,0.06)",
    padding: "1.6rem 1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem",
    minHeight: "460px",
    position: "relative",
    overflow: "hidden",
  },
  homeCardPrimary: {
    background: "linear-gradient(150deg, #eef8ff 0%, #dff0ff 45%, #d3e9ff 100%)",
    borderColor: "#b9d9ff",
  },
  homeCardScan: {
    background: "linear-gradient(150deg, #fef7f2 0%, #ffe9dc 45%, #ffe1cf 100%)",
    borderColor: "#f7c9a8",
  },
  homeTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.75rem",
  },
  homeBadge: {
    alignSelf: "flex-start",
    padding: "0.45rem 0.9rem",
    borderRadius: "999px",
    background: "rgba(15,99,168,0.12)",
    color: "#0f416b",
    fontWeight: 800,
    fontSize: "0.9rem",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  homeBadgeAlt: {
    alignSelf: "flex-start",
    padding: "0.45rem 0.9rem",
    borderRadius: "999px",
    background: "rgba(200,80,45,0.12)",
    color: "#9a3c10",
    fontWeight: 800,
    fontSize: "0.9rem",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  homeTitle: {
    fontSize: "1.65rem",
    fontWeight: 800,
    color: "#10253b",
    margin: 0,
    letterSpacing: "-0.3px",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  homeSubtitle: {
    fontSize: "1.08rem",
    fontWeight: 650,
    color: "#1e3b53",
    margin: 0,
    lineHeight: 1.4,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  homeList: {
    margin: "0.25rem 0 0",
    paddingLeft: "1.1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    color: "#10253b",
    fontWeight: 650,
    fontSize: "1.02rem",
    letterSpacing: "-0.1px",
  },
  homeActions: {
    marginTop: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.8rem",
    height: "12rem",
  },
  homeActionsScan: {
    height: "12rem",
    justifyContent: "flex-end",
  },
  primaryButtonLarge: {
    width: "100%",
    padding: "1.35rem 1.2rem",
    fontSize: "1.2rem",
    fontWeight: 800,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    borderRadius: "12px",
    border: "none",
    color: "white",
    cursor: "pointer",
    boxShadow: "0 14px 26px rgba(0,0,0,0.18)",
    background: "linear-gradient(180deg, #0f78c1 0%, #0c5c9b 100%)",
    transition: "transform 0.2s, box-shadow 0.2s, opacity 0.2s",
    minHeight: "5.6rem",
  },
  primaryButtonTall: {
    paddingTop: "1.8rem",
    paddingBottom: "1.8rem",
    fontSize: "1.24rem",
  },
  primaryButtonScan: {
    background: "linear-gradient(180deg, #fda061 0%, #f57432 100%)",
    boxShadow: "0 14px 26px rgba(245, 116, 50, 0.25)",
  },
  homePreviewRow: {
    display: "flex",
    gap: "0.6rem",
    marginTop: "0.25rem",
  },
  previewPill: {
    padding: "0.55rem 1rem",
    borderRadius: "999px",
    background: "rgba(33, 150, 83, 0.14)",
    color: "#19683c",
    fontWeight: 750,
    fontSize: "0.98rem",
    boxShadow: "0 8px 18px rgba(33, 150, 83, 0.28), inset 0 1px 0 rgba(255,255,255,0.6)",
  },
  previewPillDanger: {
    padding: "0.55rem 1rem",
    borderRadius: "999px",
    background: "rgba(200, 60, 60, 0.14)",
    color: "#9a1f1f",
    fontWeight: 750,
    fontSize: "0.98rem",
    boxShadow: "0 8px 18px rgba(200, 60, 60, 0.28), inset 0 1px 0 rgba(255,255,255,0.6)",
  },
  homePreviewTop: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  homeGraphic: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "0.25rem 0",
    marginTop: "40px",
  },
  homeQrImage: {
    width: "230px",
    height: "230px",
    objectFit: "contain",
    filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.16))",
  },
  scanHeaderBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.5rem 0.25rem 0.1rem",
  },
  backButton: {
    background: "linear-gradient(135deg, #0f63a8 0%, #0c8bca 100%)",
    border: "1px solid rgba(12,99,168,0.28)",
    color: "white",
    fontWeight: 850,
    fontSize: "1.05rem",
    cursor: "pointer",
    padding: "0.75rem 1.2rem",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.45rem",
    borderRadius: "14px",
    boxShadow: "0 12px 22px rgba(12,99,168,0.25)",
  },
  footerActions: {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "0.8rem",
  },
  helpButton: {
    padding: "0.85rem 1.4rem",
    fontSize: "1rem",
    fontWeight: 600,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    background: "linear-gradient(180deg, #f7fbff 0%, #e3ecf9 100%)",
    color: "#123a6a",
    border: "2px solid #b8c9e6",
    borderRadius: "12px",
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
  },
  iconLink: {
    background: "none",
    border: "none",
    color: "#0f5d95",
    textDecoration: "underline",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "0.95rem",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    padding: 0,
  },
  iconLinkFloating: {
    position: "absolute",
    top: "1.25rem",
    right: "1.25rem",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    background: "linear-gradient(135deg, #0f63a8 0%, #0c8bca 100%)",
    border: "1px solid rgba(255,255,255,0.32)",
    color: "white",
    cursor: "pointer",
    fontWeight: 680,
    fontSize: "0.86rem",
    letterSpacing: "0.01em",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    padding: "0.5rem 0.78rem",
    borderRadius: "999px",
    boxShadow: "0 5px 14px rgba(12,99,168,0.18), 0 2px 5px rgba(0,0,0,0.12)",
    transition: "transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease",
    textDecoration: "none",
  },
  iconLinkFloatingIcon: {
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.16)",
    display: "grid",
    placeItems: "center",
    fontSize: "0.9rem",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.32)",
  },
  iconLinkFloatingText: {
    display: "block",
    lineHeight: 1,
  },
  secondaryButton: {
    padding: "0.85rem 1.4rem",
    fontSize: "1.08rem",
    fontWeight: 700,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    background: "linear-gradient(180deg, #e6f5ff 0%, #cde9ff 100%)",
    color: "#0f416b",
    border: "2px solid #8bc2f7",
    borderRadius: "12px",
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
  },
  secondaryButtonLarge: {
    paddingTop: "1.05rem",
    paddingBottom: "1.05rem",
    fontSize: "1.12rem",
    fontWeight: 750,
    boxSizing: "border-box",
    minHeight: "5.6rem",
  },
  toastOverlay: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1.5rem",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    zIndex: 12000,
    transition: "opacity 0.25s ease",
  },
  toastOverlaySuccess: {
    background: "rgba(46, 160, 67, 0.22)",
  },
  toastOverlayError: {
    background: "rgba(209, 52, 56, 0.22)",
  },
  toastCard: {
    display: "flex",
    alignItems: "center",
    gap: "0.85rem",
    padding: "1.35rem 1.65rem",
    borderRadius: "22px",
    minWidth: "clamp(280px, 46vw, 560px)",
    boxShadow: "0 22px 48px rgba(0,0,0,0.18)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    border: "1px solid rgba(255,255,255,0.65)",
  },
  toastCardSuccess: {
    background: "linear-gradient(135deg, rgba(46,160,67,0.92) 0%, rgba(23,105,40,0.9) 100%)",
    color: "white",
  },
  toastCardError: {
    background: "linear-gradient(135deg, rgba(209,52,56,0.9) 0%, rgba(142,22,29,0.9) 100%)",
    color: "white",
  },
  toastIcon: {
    width: "54px",
    height: "54px",
    borderRadius: "16px",
    background: "rgba(255,255,255,0.22)",
    display: "grid",
    placeItems: "center",
    fontSize: "1.45rem",
    flexShrink: 0,
    boxShadow: "0 10px 28px rgba(0,0,0,0.18) inset",
  },
  toastText: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  toastTitle: {
    fontSize: "1.05rem",
    fontWeight: 800,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    letterSpacing: "0.01em",
  },
  toastMessage: {
    fontSize: "0.98rem",
    fontWeight: 600,
    opacity: 0.95,
    lineHeight: 1.35,
  },
  adminButton: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.65rem 0.95rem 0.65rem 0.7rem",
    borderRadius: "999px",
    background: "linear-gradient(120deg, #1a2f4b 0%, #2c6dad 45%, #3d8fd8 100%)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.18)",
    cursor: "pointer",
    boxShadow: "0 10px 22px rgba(0,0,0,0.14), 0 6px 12px rgba(61,143,216,0.22)",
    transition: "transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease",
    minWidth: "205px",
    justifyContent: "space-between",
  },
  adminButtonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
    filter: "saturate(0.75)",
    boxShadow: "none",
  },
  adminIconBadge: {
    width: "42px",
    height: "42px",
    borderRadius: "14px",
    background: "linear-gradient(145deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
    display: "grid",
    placeItems: "center",
    color: "white",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45)",
  },
  adminTextBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "0.1rem",
    flex: 1,
    minWidth: 0,
  },
  adminLabel: {
    fontWeight: 800,
    fontSize: "0.95rem",
    letterSpacing: "0.01em",
  },
  adminSubtitle: {
    fontWeight: 600,
    fontSize: "0.83rem",
    color: "rgba(255,255,255,0.82)",
  },
  adminChevron: {
    width: "24px",
    height: "24px",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.12)",
    display: "grid",
    placeItems: "center",
    color: "white",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background:
      "radial-gradient(circle at 20% 20%, rgba(15,93,187,0.12), transparent 35%), radial-gradient(circle at 80% 0%, rgba(46,160,67,0.12), transparent 30%), rgba(248,252,255,0.78)",
    backdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    padding: "1.5rem",
  },
  overlayContent: {
    width: "100%",
    maxWidth: "1300px",
    background: "#ffffff",
    borderRadius: "18px",
    padding: "1.6rem 1.8rem",
    color: "#102a43",
    border: "1px solid #e5edf7",
    boxShadow: "0 22px 60px rgba(16, 42, 67, 0.18)",
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  privacyContent: {
    width: "100%",
    maxWidth: "1280px",
    maxHeight: "calc(100vh - 180px)",
    background: "#ffffff",
    borderRadius: "18px",
    padding: "1.6rem 1.8rem",
    color: "#0f2743",
    border: "1px solid #e2eaf6",
    boxShadow: "0 22px 60px rgba(16, 42, 67, 0.18)",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    overflow: "hidden",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  privacyTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "1rem",
  },
  privacyTitle: {
    fontSize: "1.6rem",
    fontWeight: 800,
    letterSpacing: "-0.3px",
  },
  privacySubtitle: {
    fontSize: "1.02rem",
    fontWeight: 600,
    color: "#4a6280",
    marginTop: "0.1rem",
  },
  privacyLayout: {
    display: "grid",
    gridTemplateColumns: "320px 1fr",
    gap: "1rem",
    minHeight: "520px",
    overflow: "hidden",
  },
  privacyList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    padding: "0.6rem",
    background: "#f6fbff",
    border: "1px solid #e5edf7",
    borderRadius: "14px",
  },
  privacyListItem: {
    textAlign: "left",
    padding: "0.75rem 0.85rem",
    borderRadius: "12px",
    border: "1px solid #dbe7f5",
    background: "#ffffff",
    cursor: "pointer",
    boxShadow: "0 6px 14px rgba(0, 63, 114, 0.08)",
  },
  privacyListItemActive: {
    borderColor: "#0f73ee",
    boxShadow: "0 10px 24px rgba(15, 115, 238, 0.15)",
    background: "linear-gradient(145deg, #f2f7ff 0%, #ffffff 100%)",
  },
  privacyListLabel: {
    fontWeight: 750,
    color: "#0f2743",
  },
  privacyListFile: {
    fontSize: "0.9rem",
    color: "#4a6280",
    marginTop: "0.2rem",
  },
  privacyViewer: {
    background: "#0d2035",
    borderRadius: "14px",
    border: "1px solid #0f355c",
    display: "flex",
    flexDirection: "column",
    minHeight: "520px",
    maxHeight: "calc(100vh - 260px)",
    overflow: "hidden",
    boxShadow: "0 16px 32px rgba(0, 24, 54, 0.3)",
  },
  privacyIframe: {
    flex: 1,
    width: "100%",
    border: "none",
    background: "#0d2035",
  },
  privacyHelper: {
    padding: "0.75rem 1rem",
    color: "#dbe8ff",
    fontSize: "0.95rem",
    background: "rgba(255,255,255,0.06)",
  },
  privacyActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.6rem",
  },
  destinationContent: {
    width: "100%",
    maxWidth: "1180px",
    background: "linear-gradient(180deg, #f7faff 0%, #ffffff 40%)",
    borderRadius: "18px",
    padding: "1.6rem 1.8rem",
    color: "#0f2743",
    border: "1px solid #e3eaf5",
    boxShadow: "0 20px 50px rgba(0, 38, 87, 0.14)",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    display: "flex",
    flexDirection: "column",
    gap: "0.8rem",
  },
  destinationTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  destinationPill: {
    padding: "0.45rem 0.9rem",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #d9fbe5 0%, #b7efcd 100%)",
    color: "#0f3a5f",
    fontWeight: 800,
    fontSize: "0.95rem",
    letterSpacing: "0.02em",
    boxShadow: "0 10px 22px rgba(23, 122, 67, 0.16)",
  },
  destinationClose: {
    padding: "0.65rem 1rem",
    borderRadius: "12px",
    border: "1px solid #d6deeb",
    background: "#f0f4f8",
    color: "#0f3a5f",
    fontWeight: 750,
    cursor: "pointer",
    boxShadow: "0 6px 14px rgba(0,0,0,0.06)",
  },
  destinationHeaderText: {
    fontWeight: 850,
    fontSize: "1.7rem",
    color: "#0f2743",
    letterSpacing: "-0.3px",
  },
  destinationSubtext: {
    fontWeight: 600,
    fontSize: "1.02rem",
    color: "#4a6280",
  },
  destinationVisitorRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.85rem 1rem",
    borderRadius: "14px",
    background: "#f7fbff",
    border: "1px solid #e5edf7",
  },
  destinationAvatar: {
    width: "46px",
    height: "46px",
    borderRadius: "14px",
    background: "linear-gradient(135deg, #0f5dbb 0%, #0a3f7a 100%)",
    color: "white",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: "1.05rem",
    boxShadow: "0 10px 20px rgba(10,63,122,0.2)",
  },
  destinationName: {
    fontWeight: 800,
    fontSize: "1.1rem",
    color: "#0f2743",
  },
  destinationHint: {
    fontWeight: 600,
    color: "#4a6280",
    fontSize: "0.95rem",
  },
  destinationGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "1.05rem",
    marginTop: "0.35rem",
  },
  destinationCard: {
    borderRadius: "14px",
    padding: "1.35rem 1.4rem",
    border: "1px solid #e0e9f7",
    background: "linear-gradient(135deg, #ffffff 0%, #f7fbff 100%)",
    boxShadow: "0 12px 24px rgba(16,42,67,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontWeight: 800,
    color: "#0f2743",
    fontSize: "1.14rem",
    cursor: "pointer",
    minHeight: "120px",
    transition: "transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease",
  },
  destinationCardDisabled: {
    opacity: 0.7,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  destinationCardTitle: {
    fontWeight: 850,
  },
  destinationCardArrow: {
    fontSize: "1.35rem",
    color: "#0f5dbb",
  },
  tutorialContent: {
    width: "100%",
    maxWidth: "1200px",
    maxHeight: "85vh",
    background: "linear-gradient(180deg, #f7faff 0%, #ffffff 45%)",
    borderRadius: "18px",
    padding: "1.6rem 1.8rem",
    color: "#0f2743",
    border: "1px solid #e3eaf5",
    boxShadow: "0 24px 60px rgba(0, 38, 87, 0.16)",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    overflow: "hidden",
  },
  tutorialTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tutorialPill: {
    padding: "0.45rem 0.95rem",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #e0f2fe 0%, #cbdcf6 100%)",
    color: "#0f3a5f",
    fontWeight: 800,
    fontSize: "0.95rem",
    letterSpacing: "0.02em",
    boxShadow: "0 10px 22px rgba(15,93,187,0.14)",
  },
  tutorialHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  tutorialTitle: {
    fontWeight: 850,
    fontSize: "1.8rem",
    letterSpacing: "-0.3px",
    color: "#0f2743",
  },
  tutorialSubtitle: {
    fontWeight: 600,
    fontSize: "1.05rem",
    color: "#4a6280",
  },
  tutorialVideoWrapper: {
    borderRadius: "16px",
    overflow: "hidden",
  },
  tutorialVideo: {
    width: "100%",
    height: "auto",
    display: "block",
  },
  tutorialActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  tutorialHint: {
    fontWeight: 650,
    color: "#0f3a5f",
    textAlign: "center",
    width: "100%",
  },
  helpContent: {
    width: "100%",
    maxWidth: "900px",
    background: "#ffffff",
    borderRadius: "16px",
    padding: "1.6rem 1.8rem",
    color: "#102a43",
    border: "1px solid #e5edf7",
    boxShadow: "0 18px 50px rgba(16, 42, 67, 0.16)",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  helpHeader: {
    textAlign: "center",
    fontWeight: 800,
    fontSize: "0.95rem",
    color: "#486581",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  helpTitle: {
    textAlign: "center",
    fontWeight: 800,
    fontSize: "1.7rem",
    marginTop: "0.2rem",
    marginBottom: "1rem",
    color: "#102a43",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  helpGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "1rem",
  },
  helpCard: {
    background: "#f7fbff",
    borderRadius: "12px",
    padding: "1rem",
    border: "1px solid #e0e8f5",
    boxShadow: "0 10px 20px rgba(16,42,67,0.08)",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  helpBadge: {
    width: "32px",
    height: "32px",
    borderRadius: "10px",
    background: "linear-gradient(135deg, #2dd4bf 0%, #0ea5e9 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    color: "white",
    fontSize: "0.95rem",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  helpCardTitle: {
    fontWeight: 800,
    fontSize: "1.05rem",
    color: "#0f3a5f",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  helpText: {
    fontWeight: 500,
    fontSize: "0.95rem",
    color: "#3a506b",
    lineHeight: 1.45,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  helpActions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "1.2rem",
  },
  onboardingContent: {
    width: "100%",
    maxWidth: "1024px",
    background: "linear-gradient(180deg, #f7f9fd 0%, #ffffff 32%)",
    borderRadius: "18px",
    padding: "1.4rem 1.6rem 1.6rem",
    color: "#0f2743",
    border: "1px solid #e3e9f4",
    boxShadow: "0 20px 55px rgba(0, 38, 87, 0.16)",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  onboardingTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
  },
  brandBlock: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  brandIcon: {
    width: "44px",
    height: "44px",
    borderRadius: "12px",
    background: "linear-gradient(135deg, #1a73e8 0%, #0f5dbb 100%)",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: "1.05rem",
    boxShadow: "0 10px 22px rgba(15,93,187,0.28)",
  },
  brandTitle: {
    fontWeight: 800,
    fontSize: "1.05rem",
    color: "#0f2743",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  brandSubtitle: {
    fontWeight: 600,
    fontSize: "0.95rem",
    color: "#557293",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  modePill: {
    padding: "0.45rem 0.9rem",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #0f5dbb 0%, #09498f 100%)",
    color: "white",
    fontWeight: 800,
    fontSize: "0.95rem",
    letterSpacing: "0.02em",
    boxShadow: "0 10px 22px rgba(15,93,187,0.18)",
    whiteSpace: "nowrap",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  onboardingHero: {
    textAlign: "center",
    marginTop: "0.35rem",
    marginBottom: "1.15rem",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  heroTitle: {
    fontWeight: 800,
    fontSize: "1.9rem",
    color: "#0f2743",
    letterSpacing: "-0.3px",
    marginBottom: "0.25rem",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  heroSubtitle: {
    fontWeight: 600,
    fontSize: "1.05rem",
    color: "#5b748a",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  onboardingBody: {
    background: "#ffffff",
    borderRadius: "14px",
    padding: "1.1rem 1.2rem",
    border: "1px solid #e3eaf5",
    boxShadow: "0 10px 28px rgba(16,42,67,0.08)",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "0.9rem 1rem",
  },
  formField: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  formLabel: {
    fontWeight: 700,
    fontSize: "0.95rem",
    color: "#0f3a5f",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  requiredMark: {
    color: "#c62828",
    marginLeft: "0.25rem",
    fontWeight: 800,
  },
  formInput: {
    padding: "0.95rem 1.05rem",
    borderRadius: "12px",
    border: "1px solid #d6deeb",
    background: "#ffffff",
    color: "#0f3a5f",
    outline: "none",
    boxShadow: "0 6px 16px rgba(15,93,187,0.06)",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  requiredInput: {
    borderColor: "#d32f2f",
    boxShadow: "0 6px 16px rgba(211,47,47,0.12)",
    background: "linear-gradient(180deg, #fff7f7 0%, #ffffff 65%)",
  },
  inputDisabled: {
    opacity: 0.7,
    cursor: "not-allowed",
    background: "#f4f7fb",
  },
  helperText: {
    fontSize: "0.9rem",
    color: "#5b748a",
    opacity: 0.9,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  errorText: {
    fontSize: "0.9rem",
    color: "#c62828",
    marginTop: "0.15rem",
    fontWeight: 700,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  termsRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.55rem",
    marginTop: "1rem",
    color: "#0f3a5f",
    fontWeight: 600,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  checkbox: {
    width: "18px",
    height: "18px",
    borderRadius: "6px",
    border: "1.5px solid #0f5dbb",
    accentColor: "#0f5dbb",
    marginTop: "2px",
  },
  termsText: {
    lineHeight: 1.45,
    color: "#0f3a5f",
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  },
  onboardingActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.65rem",
    marginTop: "1rem",
  },
  primaryButton: {
    padding: "0.95rem 1.5rem",
    fontSize: "1rem",
    fontWeight: 800,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    background: "linear-gradient(135deg, #1d4ed8 0%, #0f5dbb 100%)",
    color: "white",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    boxShadow: "0 12px 22px rgba(15,93,187,0.25)",
    transition: "transform 0.12s ease, box-shadow 0.12s ease",
  },
  primaryButtonDisabled: {
    background: "#d5deeb",
    boxShadow: "none",
    cursor: "not-allowed",
    color: "#6b7a90",
  },
  scannerHeader: {
    textAlign: "center",
    fontWeight: 800,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    fontSize: "1.05rem",
    color: "#486581",
  },
  scannerHeaderBlock: {
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
  },
  scannerTitle: {
    textAlign: "center",
    fontWeight: 800,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    fontSize: "1.8rem",
    marginTop: "0.3rem",
    marginBottom: "0.15rem",
    color: "#0f3a5f",
  },
  scannerSubtitle: {
    textAlign: "center",
    fontWeight: 600,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    fontSize: "1.15rem",
    color: "#5b748a",
    marginBottom: "1.2rem",
  },
  scannerTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
  },
  scannerPill: {
    padding: "0.4rem 0.9rem",
    borderRadius: "999px",
    fontWeight: 800,
    fontSize: "0.95rem",
    letterSpacing: "0.02em",
    boxShadow: "0 10px 22px rgba(15,93,187,0.18)",
    border: "1px solid rgba(0,0,0,0.04)",
  },
  scannerPillSuccess: {
    background: "linear-gradient(135deg, #d9fbe5 0%, #b2f0c6 100%)",
    color: "#0f3a5f",
  },
  scannerPillWarning: {
    background: "linear-gradient(135deg, #ffe5e5 0%, #ffd4d4 100%)",
    color: "#5a1b1b",
  },
  scannerLive: {
    display: "flex",
    alignItems: "center",
    gap: "0.45rem",
    padding: "0.35rem 0.75rem",
    borderRadius: "12px",
    background: "#f0f4f8",
    color: "#0f3a5f",
    fontWeight: 700,
    border: "1px solid #dbe6f3",
  },
  liveDot: {
    width: "10px",
    height: "10px",
    borderRadius: "999px",
    background: "#22c55e",
    boxShadow: "0 0 0 6px rgba(34,197,94,0.18)",
    display: "inline-flex",
  },
  scannerLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1fr)",
    gap: "1.1rem",
    alignItems: "stretch",
  },
  scannerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "0.55rem",
  },
  scannerRight: {
    display: "flex",
    flexDirection: "column",
    gap: "0.8rem",
  },
  scannerFrameWrapper: {
    background: "#f5f8fd",
    borderRadius: "14px",
    padding: "1rem",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    boxShadow: "inset 0 0 0 1px #e5edf7",
  },
  scannerFrame: {
    width: "720px",
    maxWidth: "100%",
    aspectRatio: "16 / 9",
    background: "#0b1727",
    borderRadius: "16px",
    position: "relative",
    overflow: "hidden",
    border: "2px solid #d9e4f2",
  },
  scannerVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    filter: "brightness(1.05)",
  },
  scanOverlayLabel: {
    position: "absolute",
    left: "14px",
    bottom: "14px",
    padding: "0.35rem 0.65rem",
    borderRadius: "10px",
    background: "rgba(39,163,23,0.5)",
    color: "#e5f4ff",
    fontWeight: 700,
    fontSize: "0.95rem",
    backdropFilter: "blur(6px)",
  },
  captureHint: {
    fontWeight: 600,
    fontSize: "0.95rem",
    color: "#3a506b",
  },
  scannerCorner: {
    position: "absolute",
    width: "80px",
    height: "80px",
    border: "7px solid #38bdf8",
    borderRadius: "18px",
    boxShadow: "0 0 16px rgba(56, 189, 248, 0.4)",
  },
  cornerTopLeft: { top: "8%", left: "8%", borderRight: "none", borderBottom: "none" },
  cornerTopRight: { top: "8%", right: "8%", borderLeft: "none", borderBottom: "none" },
  cornerBottomLeft: { bottom: "8%", left: "8%", borderRight: "none", borderTop: "none" },
  cornerBottomRight: { bottom: "8%", right: "8%", borderLeft: "none", borderTop: "none" },
  stateCard: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "1rem 1.1rem",
    borderRadius: "14px",
    border: "1px solid #e5edf7",
    boxShadow: "0 12px 24px rgba(16,42,67,0.12)",
    transition: "transform 0.18s ease, box-shadow 0.18s ease",
    background: "white",
  },
  stateWaiting: {
    background: "linear-gradient(135deg, #eef4ff 0%, #e2ecff 100%)",
    borderColor: "#d6e4ff",
  },
  stateSuccess: {
    background: "linear-gradient(135deg, #e1f7ec 0%, #c7f2da 100%)",
    borderColor: "#b4e6ca",
  },
  stateError: {
    background: "linear-gradient(135deg, #ffecec 0%, #ffd5d5 100%)",
    borderColor: "#ffc7c7",
  },
  stateIcon: {
    fontSize: "1.9rem",
  },
  stateTextWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
    color: "#0f3a5f",
  },
  stateTitle: {
    fontWeight: 800,
    fontSize: "1.1rem",
    color: "#0f3a5f",
  },
  stateSubtitle: {
    fontWeight: 600,
    fontSize: "0.96rem",
    color: "#425a76",
  },
  stepsCard: {
    background: "#f7fbff",
    borderRadius: "14px",
    padding: "0.95rem 1rem",
    border: "1px solid #e3eaf5",
    boxShadow: "0 10px 24px rgba(16,42,67,0.1)",
  },
  stepsHeader: {
    fontWeight: 800,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    fontSize: "1rem",
    color: "#0f3a5f",
    marginBottom: "0.5rem",
  },
  stepList: {
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: "0.55rem",
    margin: 0,
    padding: 0,
  },
  stepItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.55rem",
    color: "#3a506b",
    fontWeight: 600,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    fontSize: "0.98rem",
  },
  stepIndex: {
    minWidth: "28px",
    height: "28px",
    borderRadius: "10px",
    background: "#0f5dbb",
    color: "white",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: "0.95rem",
    boxShadow: "0 8px 18px rgba(15,93,187,0.22)",
  },
  stepBody: {
    lineHeight: 1.4,
  },
  tipsCard: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
    padding: "0.9rem 1rem",
    borderRadius: "12px",
    background: "linear-gradient(135deg, #0f5dbb 0%, #0a3f7a 100%)",
    color: "white",
    boxShadow: "0 14px 26px rgba(10,63,122,0.35)",
  },
  tipBadge: {
    padding: "0.35rem 0.65rem",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.2)",
    fontWeight: 800,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    fontSize: "0.9rem",
  },
  tipText: {
    fontWeight: 700,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    fontSize: "0.98rem",
  },
  scannerActions: {
    color: "#5b748a",
    display: "flex",
    justifyContent: "flex-end",
  },
  closeButton: {
    padding: "0.85rem 1.4rem",
    fontSize: "1rem",
    fontWeight: 700,
    fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    background: "#f0f4f8",
    color: "rgb(183, 18, 18)",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(16,42,67,0.14)",
  },
  footerClockWrapper: {
    position: "absolute",
    right: 0,
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
};
