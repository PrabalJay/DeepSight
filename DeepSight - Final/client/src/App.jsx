import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:5000/api").replace(/\/$/, "");
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "mp4", "mov", "avi", "webm", "mkv"];

function verdictClass(verdict) {
  return verdict === "MANIPULATED" ? "danger" : verdict === "INCONCLUSIVE" ? "warning" : "safe";
}

function readableDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function App() {
  const [section, setSection] = useState("scan");
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [authMode, setAuthMode] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [account, setAccount] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("deepsight_account") || "null");
    } catch {
      return null;
    }
  });
  const inputRef = useRef(null);
  const token = () => sessionStorage.getItem("deepsight_token");

  const loadHistory = useCallback(async () => {
    if (!account || !token()) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`${API_URL}/history`, { headers: { Authorization: `Bearer ${token()}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load scan history.");
      setHistory(payload.history || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setHistoryLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (section === "history") loadHistory();
  }, [section, loadHistory]);

  function chooseFile(nextFile) {
    setError("");
    setResult(null);
    if (!nextFile) return;
    const extension = nextFile.name.split(".").pop()?.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      setFile(null);
      setError("Choose a JPG, PNG, WEBP, MP4, MOV, AVI, WEBM, or MKV file.");
      return;
    }
    if (nextFile.size > MAX_FILE_BYTES) {
      setFile(null);
      setError("The selected file is larger than the 20 MB limit.");
      return;
    }
    setFile(nextFile);
  }

  async function scanFile() {
    if (!file || scanning) return;
    setScanning(true);
    setError("");
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const headers = token() ? { Authorization: `Bearer ${token()}` } : {};
      const response = await fetch(`${API_URL}/analyze`, { method: "POST", body, headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The scan could not be completed.");
      setResult(payload);
      if (account) loadHistory();
    } catch (requestError) {
      setError(requestError.message || "The scan could not be completed.");
    } finally {
      setScanning(false);
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { name: form.get("name"), email: form.get("email"), password: form.get("password") };
    setAuthBusy(true);
    setAuthError("");
    try {
      const route = authMode === "register" ? "register" : "login";
      if (route === "login") delete body.name;
      const response = await fetch(`${API_URL}/auth/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not sign in.");
      sessionStorage.setItem("deepsight_token", payload.token);
      sessionStorage.setItem("deepsight_account", JSON.stringify(payload.user));
      setAccount(payload.user);
      setAuthMode(null);
      setSection("history");
    } catch (requestError) {
      setAuthError(requestError.message);
    } finally {
      setAuthBusy(false);
    }
  }

  function signOut() {
    sessionStorage.removeItem("deepsight_token");
    sessionStorage.removeItem("deepsight_account");
    setAccount(null);
    setHistory([]);
    setSection("scan");
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => setSection("scan")} aria-label="DeepSight home"><span className="brand-mark">D</span><span>DeepSight</span></button>
        <nav aria-label="Main navigation">
          <button className={section === "scan" ? "active" : ""} onClick={() => setSection("scan")}>Scan</button>
          <button className={section === "how" ? "active" : ""} onClick={() => setSection("how")}>How it works</button>
          {account && <button className={section === "history" ? "active" : ""} onClick={() => setSection("history")}>History</button>}
        </nav>
        {account ? <div className="account-menu"><span>Hi, {account.name.split(" ")[0]}</span><button className="text-button" onClick={signOut}>Sign out</button></div> : <div className="auth-actions"><button className="text-button" onClick={() => setAuthMode("login")}>Sign in</button><button className="small-primary" onClick={() => setAuthMode("register")}>Create account</button></div>}
      </header>

      <main>
        {section === "scan" && <>
          <section className="intro">
            <p className="eyebrow">Local deepfake analysis</p><h1>Know what you are looking at.</h1>
            <p className="intro-copy">Upload an image or video for a clear, model-based confidence score. Videos are evaluated across 16-frame temporal clips using PyTorch VideoMAE.</p>
            <div className="thresholds" aria-label="Verdict thresholds"><span><i className="safe-dot" />Under 45% authentic</span><span><i className="warning-dot" />45–55% inconclusive</span><span><i className="danger-dot" />Over 55% manipulated</span></div>
          </section>
          <section className="scanner-card" aria-labelledby="scanner-heading">
            <div className="scanner-heading"><div><p className="eyebrow">New analysis</p><h2 id="scanner-heading">Upload media</h2></div><span className="limit-label">Maximum file size: 20 MB</span></div>
            <div className={`drop-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`} role="button" tabIndex="0" onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/x-msvideo,video/webm,video/x-matroska" onChange={(event) => chooseFile(event.target.files[0])} />
              <span className="upload-icon">↑</span>
              {file ? <><strong>{file.name}</strong><small>{(file.size / (1024 * 1024)).toFixed(2)} MB · Ready to scan</small></> : <><strong>Drop a file here, or browse</strong><small>JPG, PNG, WEBP, MP4, MOV, AVI, WEBM, or MKV</small></>}
            </div>
            {file && <button className="remove-file" onClick={() => { setFile(null); setResult(null); }}>Remove selected file</button>}
            {error && <p className="message error-message" role="alert">{error}</p>}
            <button className="scan-button" disabled={!file || scanning} onClick={scanFile}>{scanning ? "Analyzing your media…" : "Analyze media"}</button>
            {!account && <p className="history-note">Sign in before scanning to save the result in your personal history.</p>}
          </section>
          {result && <section className="result-card" aria-live="polite"><div className="result-top"><div><p className="eyebrow">Analysis complete</p><h2>{result.file_name}</h2></div><span className={`verdict-badge ${verdictClass(result.verdict)}`}>{result.verdict}</span></div><div className="result-grid"><div className="score-block"><strong>{Number(result.confidence_score).toFixed(2)}%</strong><span>Manipulation confidence</span></div><div><p><b>{result.frames_analyzed}</b> {result.media_type === "video" ? (result.frames_analyzed === 1 ? "clip analyzed" : "clips analyzed") : "image analyzed"}</p><p>{result.message}</p>{result.frame_score_range && <p className="muted">Score range: {result.frame_score_range[0]}%–{result.frame_score_range[1]}%</p>}</div></div>{result.saved_to_history && <p className="saved-note">Saved to your scan history.</p>}</section>}
        </>}
        {section === "how" && <section className="info-page"><p className="eyebrow">How DeepSight works</p><h1>A simple local truth engine.</h1><div className="steps"><article><span>01</span><h2>Validate</h2><p>The API accepts supported image and video formats up to 20 MB.</p></article><article><span>02</span><h2>Inspect</h2><p>Images are evaluated with EfficientNet. Videos are processed into 16-frame temporal clips with VideoMAE.</p></article><article><span>03</span><h2>Explain</h2><p>The model’s average manipulation score is reported as authentic, inconclusive, or manipulated.</p></article></div><p className="disclaimer">DeepSight is an educational screening tool. A confidence score is not proof and should be combined with source checking and human review.</p></section>}
        {section === "history" && <section className="history-page"><p className="eyebrow">Personal history</p><h1>Your recent scans</h1>{historyLoading ? <p>Loading history…</p> : history.length === 0 ? <div className="empty-state"><h2>No saved scans yet</h2><p>Scan media while signed in and it will appear here.</p><button className="small-primary" onClick={() => setSection("scan")}>Start a scan</button></div> : <div className="history-list">{history.map((scan) => <article className="history-row" key={scan.id}><div><h2>{scan.fileName}</h2><p>{scan.mediaType} · {scan.framesAnalyzed} {scan.mediaType === "video" ? (scan.framesAnalyzed === 1 ? "clip" : "clips") : "frame"} · {readableDate(scan.createdAt)}</p></div><div className="history-score"><span className={`verdict-badge ${verdictClass(scan.verdict)}`}>{scan.verdict}</span><strong>{Number(scan.confidenceScore).toFixed(2)}%</strong></div></article>)}</div>}</section>}
      </main>
      <footer>DeepSight — Designed and Developed by 27_CS4E_03</footer>
      {authMode && <div className="modal-backdrop" role="presentation" onMouseDown={() => setAuthMode(null)}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}><button className="close-modal" onClick={() => setAuthMode(null)} aria-label="Close">×</button><p className="eyebrow">Your private workspace</p><h2 id="auth-title">{authMode === "register" ? "Create an account" : "Welcome back"}</h2><form onSubmit={submitAuth}>{authMode === "register" && <label>Name<input name="name" minLength="2" required autoComplete="name" /></label>}<label>Email<input name="email" type="email" required autoComplete="email" /></label><label>Password<input name="password" type="password" minLength="6" required autoComplete={authMode === "register" ? "new-password" : "current-password"} /></label>{authError && <p className="message error-message">{authError}</p>}<button className="scan-button" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "register" ? "Create account" : "Sign in"}</button></form><button className="switch-auth" onClick={() => { setAuthError(""); setAuthMode(authMode === "register" ? "login" : "register"); }}>{authMode === "register" ? "Already have an account? Sign in" : "Need an account? Create one"}</button></section></div>}
    </div>
  );
}

export default App;
