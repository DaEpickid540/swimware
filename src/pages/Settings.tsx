/**
 * Admin global settings: club identity, allowed coach email domains, and legal
 * text (bumping a version forces swimmers to re-accept on next login). Logo
 * upload writes to Storage (branding/) per storage.rules.
 */
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/services/firebase";
import { Card, Spinner } from "@/components/ui";

interface AppSettings {
  clubName: string;
  primaryColor: string;
  allowedCoachDomains: string;
  legal: { termsVersion: string; terms: string; privacy: string; waiver: string };
  logoUrl?: string;
  // Paid (Blaze) features — OFF by default. When off, the documented FREE
  // alternative is used and the app stays fully functional.
  emailNotificationsEnabled?: boolean; // needs Blaze Cloud Functions + email ext
}

const DEFAULTS: AppSettings = {
  clubName: "Mason Rec Rays",
  primaryColor: "#0b6bcb",
  allowedCoachDomains: "",
  legal: {
    termsVersion: "2026-06-16",
    terms: "Standard terms of use…",
    privacy: "We collect minimal data needed to run the team…",
    waiver: "I acknowledge the risks of swimming activities…",
  },
  emailNotificationsEnabled: false,
};

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "settings", "app")).then((snap) => {
      setSettings(snap.exists() ? ({ ...DEFAULTS, ...snap.data() } as AppSettings) : DEFAULTS);
    });
  }, []);

  async function save() {
    if (!settings) return;
    await setDoc(doc(db, "settings", "app"), { ...settings, updatedAt: serverTimestamp() }, { merge: true });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      const r = ref(storage, `branding/logo-${Date.now()}-${file.name}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      setSettings((s) => (s ? { ...s, logoUrl: url } : s));
    } finally {
      setUploading(false);
    }
  }

  if (!settings) return <Spinner />;

  return (
    <div className="page">
      <h1 className="page__title">Settings</h1>

      <Card title="Club identity">
        <div className="field">
          <label htmlFor="club-name">Club name</label>
          <input
            id="club-name"
            className="input"
            value={settings.clubName}
            onChange={(e) => setSettings({ ...settings, clubName: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="club-color">Primary color</label>
          <input
            id="club-color"
            type="color"
            className="input input--color"
            value={settings.primaryColor}
            onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="club-logo">Logo</label>
          <input
            id="club-logo"
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
          />
          {uploading && <Spinner label="Uploading…" />}
          {settings.logoUrl && <img className="logo-preview" src={settings.logoUrl} alt="Club logo preview" />}
        </div>
      </Card>

      <Card title="Paid (Blaze) features">
        <div className="callout callout--warn" role="note">
          <strong>⚙️ These features need the Firebase Blaze plan and may incur
          costs.</strong>{" "}
          The app is 100% functional on the free Spark plan with them OFF — a free
          alternative is used automatically.
        </div>
        <label className="toggle-row">
          <span>
            <strong>Email notifications</strong>
            <br />
            <span className="muted">
              Sends email to coaches on new sign-ups / RSVPs. Requires Blaze Cloud
              Functions + a free email extension.{" "}
              <strong>Free alternative (used when OFF):</strong> in-app
              notifications + “copy email template” buttons.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={!!settings.emailNotificationsEnabled}
            onChange={(e) =>
              setSettings({ ...settings, emailNotificationsEnabled: e.target.checked })
            }
            aria-label="Enable email notifications (Blaze, may incur costs)"
          />
        </label>
      </Card>

      <Card title="Coach access">
        <div className="field">
          <label htmlFor="domains">Allowed coach email domains (comma-separated)</label>
          <input
            id="domains"
            className="input"
            placeholder="masonrec.org, example.com"
            value={settings.allowedCoachDomains}
            onChange={(e) => setSettings({ ...settings, allowedCoachDomains: e.target.value })}
          />
        </div>
      </Card>

      <Card title="Legal text & consent versions">
        <p className="muted">Changing the version string forces swimmers to re-accept.</p>
        <div className="field">
          <label htmlFor="legal-ver">Terms version</label>
          <input
            id="legal-ver"
            className="input"
            value={settings.legal.termsVersion}
            onChange={(e) =>
              setSettings({ ...settings, legal: { ...settings.legal, termsVersion: e.target.value } })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="legal-terms">Terms of use</label>
          <textarea
            id="legal-terms"
            className="input"
            rows={3}
            value={settings.legal.terms}
            onChange={(e) => setSettings({ ...settings, legal: { ...settings.legal, terms: e.target.value } })}
          />
        </div>
        <div className="field">
          <label htmlFor="legal-waiver">Liability waiver</label>
          <textarea
            id="legal-waiver"
            className="input"
            rows={3}
            value={settings.legal.waiver}
            onChange={(e) => setSettings({ ...settings, legal: { ...settings.legal, waiver: e.target.value } })}
          />
        </div>
      </Card>

      <button className="btn btn--primary" onClick={save}>
        Save settings
      </button>
      {saved && <span className="saved-pill" role="status"> Saved ✓</span>}
    </div>
  );
}
