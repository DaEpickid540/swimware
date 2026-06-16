/**
 * Settings — tabbed and available to everyone.
 *   • Appearance (all): theme, accent color, density — personal, localStorage.
 *   • Account (all): connected sign-in methods (link Google / email-password).
 *   • Profile (all): edit your own display name + phone.
 *   • Admin (admins only): club identity, coach domains, legal text, Blaze toggle.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useTheme, ACCENT_PRESETS, type ThemeName } from "@/context/ThemeContext";
import {
  providerIds,
  hasProvider,
  linkGoogle,
  linkEmailPassword,
  unlinkProvider,
  PROVIDER_LABELS,
} from "@/services/authLink";
import { Card, Spinner } from "@/components/ui";

type Tab = "appearance" | "account" | "profile" | "admin";

export default function Settings() {
  const { effectiveRole, profile, firebaseUser, refresh } = useAuth();
  // Use the EFFECTIVE role so an admin "viewing as" a swimmer/coach does NOT
  // see the Admin tab — the preview is faithful to the chosen role.
  const isAdmin = effectiveRole === "admin";
  const tabs = useMemo<{ id: Tab; label: string }[]>(
    () => [
      { id: "appearance", label: "Appearance" },
      { id: "account", label: "Sign-in & account" },
      { id: "profile", label: "Profile" },
      ...(isAdmin ? [{ id: "admin" as Tab, label: "Admin" }] : []),
    ],
    [isAdmin]
  );
  const [tab, setTab] = useState<Tab>("appearance");

  return (
    <div className="page">
      <h1 className="page__title">Settings</h1>

      <div className="tablist" role="tablist" aria-label="Settings sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className="tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "appearance" && <AppearanceTab />}
        {tab === "account" && <AccountTab />}
        {tab === "profile" && (
          <ProfileTab
            uid={firebaseUser?.uid}
            displayName={profile?.displayName ?? ""}
            phone={profile?.phone ?? ""}
            onSaved={refresh}
          />
        )}
        {tab === "admin" && isAdmin && <AdminTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function AppearanceTab() {
  const { theme, setTheme, accent, setAccent, density, setDensity, recBranding, setRecBranding } =
    useTheme();
  const { effectiveRole } = useAuth();
  const showBranding = effectiveRole === "coach" || effectiveRole === "admin";
  const themes: { id: ThemeName; label: string }[] = [
    { id: "light", label: "☀️ Light" },
    { id: "dark", label: "🌙 Dark" },
    { id: "high-contrast", label: "◐ High contrast" },
  ];
  return (
    <>
      <Card title="Theme">
        <p className="muted">Your choices are saved on this device and apply only to you.</p>
        <div className="seg" role="group" aria-label="Color theme">
          {themes.map((t) => (
            <button
              key={t.id}
              className={theme === t.id ? "is-active" : ""}
              aria-pressed={theme === t.id}
              onClick={() => setTheme(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Accent color">
        <div className="swatches" role="group" aria-label="Accent color">
          {ACCENT_PRESETS.map((p) => {
            const active = (accent ?? null) === p.value;
            return (
              <button
                key={p.label}
                className={`swatch${active ? " is-active" : ""}`}
                style={{
                  background:
                    p.value ?? "linear-gradient(135deg,#0b6bcb,#16a34a)",
                }}
                aria-label={p.label}
                aria-pressed={active}
                title={p.label}
                onClick={() => setAccent(p.value)}
              />
            );
          })}
        </div>
        <div className="field" style={{ marginTop: "1rem" }}>
          <label id="custom-accent-label">Custom color</label>
          <ColorField
            value={accent ?? "#0b6bcb"}
            onChange={setAccent}
            labelledBy="custom-accent-label"
          />
        </div>
      </Card>

      <Card title="Density">
        <div className="seg" role="group" aria-label="Layout density">
          <button
            className={density === "comfortable" ? "is-active" : ""}
            aria-pressed={density === "comfortable"}
            onClick={() => setDensity("comfortable")}
          >
            Comfortable
          </button>
          <button
            className={density === "compact" ? "is-active" : ""}
            aria-pressed={density === "compact"}
            onClick={() => setDensity("compact")}
          >
            Compact
          </button>
        </div>
      </Card>

      {showBranding && (
        <Card title="Rec Rays branding">
          <label className="toggle-row">
            <span>
              <strong>Show official Mason Rec Rays logo</strong>
              <br />
              <span className="muted">
                Replaces the default mark with the Rec Rays logo across your app.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={recBranding}
              onChange={(e) => setRecBranding(e.target.checked)}
              aria-label="Show Rec Rays branding"
            />
          </label>
          {recBranding && (
            <img
              src="/brand/rec-rays-logo.png"
              alt="Mason Rec Rays logo preview"
              style={{ maxHeight: 80, marginTop: ".5rem" }}
            />
          )}
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
/** Clean custom color picker: a large swatch (opens the OS picker) + a hex
 *  field with live validation. Avoids the raw, OS-styled <input type=color>. */
function ColorField({
  value,
  onChange,
  labelledBy,
}: {
  value: string;
  onChange: (hex: string) => void;
  labelledBy?: string;
}) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const [hex, setHex] = useState(value);

  useEffect(() => setHex(value), [value]);

  function commit(v: string) {
    const t = v.startsWith("#") ? v : `#${v}`;
    setHex(t);
    if (/^#[0-9a-fA-F]{6}$/.test(t)) onChange(t.toLowerCase());
  }

  return (
    <div className="colorfield" role="group" aria-labelledby={labelledBy}>
      <button
        type="button"
        className="colorfield__swatch"
        style={{ background: value }}
        onClick={() => nativeRef.current?.click()}
        aria-label="Open color picker"
        title="Open color picker"
      />
      {/* Hidden native input drives the OS color picker on swatch click. */}
      <input
        ref={nativeRef}
        type="color"
        className="colorfield__native"
        value={value}
        onChange={(e) => commit(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        type="text"
        className="input colorfield__hex"
        value={hex}
        onChange={(e) => commit(e.target.value)}
        spellCheck={false}
        maxLength={7}
        aria-label="Hex color value"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
function AccountTab() {
  const { firebaseUser } = useAuth();
  const [ids, setIds] = useState<string[]>(providerIds(firebaseUser));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function reloadIds() {
    setIds(providerIds(firebaseUser));
  }

  async function doLinkGoogle() {
    setErr(null);
    setMsg(null);
    try {
      await linkGoogle();
      reloadIds();
      setMsg("Google linked. You can now sign in with Google.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not link Google.");
    }
  }
  async function doLinkEmail(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await linkEmailPassword(email, password);
      reloadIds();
      setMsg("Email & password linked.");
      setEmail("");
      setPassword("");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not link email/password.");
    }
  }
  async function doUnlink(id: string) {
    setErr(null);
    setMsg(null);
    try {
      await unlinkProvider(id);
      reloadIds();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not unlink.");
    }
  }

  return (
    <>
      <Card title="Connected sign-in methods">
        <p className="muted">
          Link multiple methods to <strong>one account</strong> so you never create a
          duplicate. Google and email/password are free.
        </p>
        <ul className="provider-list">
          {ids.map((id) => (
            <li key={id}>
              <span>✅ {PROVIDER_LABELS[id] ?? id}</span>
              {ids.length > 1 && (
                <button className="btn btn--sm" onClick={() => doUnlink(id)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>

        {!hasProvider(firebaseUser, "google.com") && (
          <button className="btn btn--sm" onClick={doLinkGoogle} style={{ marginTop: ".5rem" }}>
            + Link Google
          </button>
        )}

        {!hasProvider(firebaseUser, "password") && (
          <form onSubmit={doLinkEmail} style={{ marginTop: "1rem" }}>
            <p className="muted">Add an email & password to this account:</p>
            <div className="field">
              <label htmlFor="link-email">Email</label>
              <input id="link-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="link-pass">Password</label>
              <input id="link-pass" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <button className="btn btn--sm" type="submit">+ Link email & password</button>
          </form>
        )}

        {msg && <p className="saved-pill" role="status">{msg}</p>}
        {err && <p className="form-error" role="alert">{err}</p>}
      </Card>

      <Card title="Phone sign-in">
        <div className="callout callout--warn" role="note">
          📱 Phone (SMS) sign-in is available but <strong>not free</strong> — Firebase
          bills per SMS beyond a small daily quota. It’s disabled by default to keep
          the app free. An admin can enable it knowing the cost; Google and
          email/password are recommended free alternatives.
        </div>
      </Card>

      <Card title="Avoid duplicate accounts">
        <p className="muted">
          Admin tip (free): in the Firebase Console → Authentication → Settings, turn
          on <strong>“One account per email address.”</strong> Firebase will then
          refuse to create a second account for an email already registered with
          another provider.
        </p>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
function ProfileTab({
  uid,
  displayName,
  phone,
  onSaved,
}: {
  uid?: string;
  displayName: string;
  phone: string;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(displayName);
  const [tel, setTel] = useState(phone);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!uid) return;
    setErr(null);
    try {
      await updateDoc(doc(db, "users", uid), {
        displayName: name,
        phone: tel,
        updatedAt: serverTimestamp(),
      });
      await onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save.");
    }
  }

  return (
    <Card title="Your profile">
      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="p-name">Display name</label>
          <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="p-phone">Phone (optional)</label>
          <input id="p-phone" type="tel" className="input" value={tel} onChange={(e) => setTel(e.target.value)} />
        </div>
        <button className="btn btn--primary" type="submit">Save profile</button>
        {saved && <span className="saved-pill" role="status"> Saved ✓</span>}
        {err && <p className="form-error" role="alert">{err}</p>}
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
interface AppSettings {
  clubName: string;
  primaryColor: string;
  allowedCoachDomains: string;
  legal: { termsVersion: string; terms: string; waiver: string };
  logoUrl?: string;
  emailNotificationsEnabled?: boolean;
  requireInviteOnly?: boolean; // hide open self-registration; invite/approval only
}
const DEFAULTS: AppSettings = {
  clubName: "Mason Rec Rays",
  primaryColor: "#0b6bcb",
  allowedCoachDomains: "",
  legal: { termsVersion: "2026-06-16", terms: "Standard terms of use…", waiver: "I acknowledge the risks of swimming activities…" },
  emailNotificationsEnabled: false,
  requireInviteOnly: true,
};

function AdminTab() {
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
    } catch {
      alert("Logo upload needs Firebase Storage enabled in the console.");
    } finally {
      setUploading(false);
    }
  }

  if (!settings) return <Spinner />;

  return (
    <>
      <Card title="Club identity">
        <div className="field">
          <label htmlFor="club-name">Club name</label>
          <input id="club-name" className="input" value={settings.clubName} onChange={(e) => setSettings({ ...settings, clubName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="club-logo">Logo</label>
          <input id="club-logo" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          {uploading && <Spinner label="Uploading…" />}
          {settings.logoUrl && <img className="logo-preview" src={settings.logoUrl} alt="Club logo preview" />}
        </div>
      </Card>

      <Card title="Coach access & sign-ups">
        <label className="toggle-row">
          <span>
            <strong>Invite-only sign-up</strong>
            <br />
            <span className="muted">
              When ON, people can’t self-register — new members join only through a
              coach’s invite link, and would-be coaches must request approval.
              Swimmers are always invite-only regardless of this setting.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.requireInviteOnly !== false}
            onChange={(e) => setSettings({ ...settings, requireInviteOnly: e.target.checked })}
            aria-label="Require invite-only sign-up"
          />
        </label>
        <div className="field">
          <label htmlFor="domains">Allowed coach email domains (comma-separated)</label>
          <input id="domains" className="input" placeholder="masonrec.org, example.com" value={settings.allowedCoachDomains} onChange={(e) => setSettings({ ...settings, allowedCoachDomains: e.target.value })} />
        </div>
      </Card>

      <Card title="Paid (Blaze) features">
        <div className="callout callout--warn" role="note">
          <strong>⚙️ Needs the Firebase Blaze plan and may incur costs.</strong> The
          app is fully functional on the free plan with this OFF — a free alternative
          is used instead.
        </div>
        <label className="toggle-row">
          <span>
            <strong>Email notifications</strong>
            <br />
            <span className="muted">
              Email coaches on sign-ups/RSVPs (needs Blaze + email extension).{" "}
              <strong>Free alternative (OFF):</strong> in-app notifications + “copy
              email template”.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={!!settings.emailNotificationsEnabled}
            onChange={(e) => setSettings({ ...settings, emailNotificationsEnabled: e.target.checked })}
            aria-label="Enable email notifications (Blaze, may incur costs)"
          />
        </label>
      </Card>

      <Card title="Legal text & consent versions">
        <p className="muted">Changing a version string forces swimmers to re-accept.</p>
        <div className="field">
          <label htmlFor="legal-ver">Terms version</label>
          <input id="legal-ver" className="input" value={settings.legal.termsVersion} onChange={(e) => setSettings({ ...settings, legal: { ...settings.legal, termsVersion: e.target.value } })} />
        </div>
        <div className="field">
          <label htmlFor="legal-terms">Terms of use</label>
          <textarea id="legal-terms" className="input" rows={3} value={settings.legal.terms} onChange={(e) => setSettings({ ...settings, legal: { ...settings.legal, terms: e.target.value } })} />
        </div>
        <div className="field">
          <label htmlFor="legal-waiver">Liability waiver</label>
          <textarea id="legal-waiver" className="input" rows={3} value={settings.legal.waiver} onChange={(e) => setSettings({ ...settings, legal: { ...settings.legal, waiver: e.target.value } })} />
        </div>
      </Card>

      <button className="btn btn--primary" onClick={save}>Save admin settings</button>
      {saved && <span className="saved-pill" role="status"> Saved ✓</span>}
    </>
  );
}
