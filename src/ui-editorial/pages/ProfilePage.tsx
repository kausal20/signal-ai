import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE, Swap } from "../motion";
import { useTheme, type ThemePref } from "../theme";
import { ProfileRow } from "../components/ProfileRow";
import { EdSegmented, EdSwitch } from "../components/controls";

export interface Opt { value: string; label: string }
export interface ProfileDetails {
  name: string;
  primary_role: string;
  primary_goal: string;
  weekly_time_budget: string;
  experience_level: string;
}
export interface ProfileOptions { roles: Opt[]; goals: Opt[]; time: Opt[]; experience: Opt[] }

export interface PushControls {
  supported: boolean;
  reason: string;
  blocked: boolean;
  on: boolean;
  busy: boolean;
  error?: string;
  quiet: boolean;
  level: string;
  levels: { id: string; label: string; desc: string }[];
  onToggle: (on: boolean) => void;
  onQuiet: (on: boolean) => void;
  onLevel: (id: string) => void;
}

export interface ProfilePageProps {
  name: string;
  roleLabel?: string;
  levelLabel: string;
  stats: { value: string; label: string }[];
  interests: string[];
  allInterests: string[];
  knows: { topics: string[]; concepts: string[] };
  details?: ProfileDetails;
  options: ProfileOptions;
  push: PushControls;
  links: { to: string; label: string; description: string }[];
  onSaveInterests: (next: string[]) => Promise<boolean>;
  onSaveDetails: (next: ProfileDetails) => Promise<boolean>;
  onClearSearches: () => void;
  onClearChats: () => void;
  onClearHistory: () => void;
  onReset: () => void;
}

const btnPrimary = "inline-flex h-11 items-center justify-center rounded-lg bg-ed-accent-ink px-5 text-[14.5px] font-semibold text-ed-on-accent transition-opacity hover:opacity-90 disabled:opacity-60";
const btnQuiet = "inline-flex h-11 items-center justify-center rounded-lg border border-ed-border-strong bg-ed-surface px-5 text-[14.5px] font-semibold text-ed-text transition-colors hover:border-ed-text-3 active:bg-ed-sunken";
const linkBtn = "inline-flex min-h-11 items-center pr-1 text-[14px] font-semibold text-ed-accent-ink underline decoration-ed-accent/40 underline-offset-4 hover:decoration-ed-accent";
const selectCls = "h-11 w-full rounded-lg border border-ed-border-strong bg-ed-surface px-3 text-[15.5px] text-ed-text outline-none focus:border-ed-accent focus:ring-2 focus:ring-ed-accent/25";

function Group({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    // Each group eases in as it scrolls into view (once).
    <motion.section
      id={id}
      aria-labelledby={`${id}-h`}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.4, ease: EASE }}
      className="scroll-mt-20 pt-12 first:pt-0"
    >
      <h2 id={`${id}-h`} className="ed-serif text-[25px] font-semibold leading-tight tracking-[-0.015em] text-ed-text">{title}</h2>
      {note && <p className="mt-1.5 max-w-[56ch] text-[14.5px] leading-relaxed text-ed-text-2">{note}</p>}
      <div className="mt-4">{children}</div>
    </motion.section>
  );
}

/** PROFILE = personalize. A quiet reading column of grouped settings; on desktop
 *  the identity block sits beside it. Honest about what Signal knows. */
export function ProfilePage(p: ProfilePageProps) {
  const theme = useTheme();
  const { hash } = useLocation();

  const [editInterests, setEditInterests] = useState(false);
  const [draft, setDraft] = useState<string[]>(p.interests);
  const [savingInterests, setSavingInterests] = useState(false);

  const [editDetails, setEditDetails] = useState(false);
  const [form, setForm] = useState<ProfileDetails | undefined>(p.details);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savedNote, setSavedNote] = useState<"" | "interests" | "details">("");
  const [failed, setFailed] = useState<"" | "interests" | "details">("");

  const [confirm, setConfirm] = useState<"" | "history" | "reset">("");
  const [cleared, setCleared] = useState<"" | "searches" | "history" | "chats">("");

  useEffect(() => { if (!editInterests) setDraft(p.interests); }, [p.interests, editInterests]);
  useEffect(() => { if (!editDetails) setForm(p.details); }, [p.details, editDetails]);

  // Deep links from the header bell / Signal AI footer.
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" }), 120);
    return () => clearTimeout(t);
  }, [hash]);

  const flash = (k: "interests" | "details") => { setSavedNote(k); setTimeout(() => setSavedNote(""), 2400); };

  const saveInterests = async () => {
    if (savingInterests) return;
    setSavingInterests(true); setFailed("");
    try {
      const ok = await p.onSaveInterests(draft);
      if (ok) { setEditInterests(false); flash("interests"); } else setFailed("interests");
    } catch { setFailed("interests"); }
    finally { setSavingInterests(false); }
  };
  const saveDetails = async () => {
    if (!form || savingDetails) return;
    setSavingDetails(true); setFailed("");
    try {
      const ok = await p.onSaveDetails({ ...form, name: form.name.trim() || p.name });
      if (ok) { setEditDetails(false); flash("details"); } else setFailed("details");
    } catch { setFailed("details"); }
    finally { setSavingDetails(false); }
  };

  const push = p.push;
  const knowsNothing = p.knows.topics.length === 0 && p.knows.concepts.length === 0;

  return (
    <div className="pt-6 lg:grid lg:grid-cols-12 lg:gap-16 lg:pt-12">
      {/* Identity */}
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="lg:col-span-4"
      >
        <div className="lg:sticky lg:top-24">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="ed-serif flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-ed-border-strong bg-ed-surface text-[28px] font-semibold text-ed-text">
              {(p.name.trim().charAt(0) || "S").toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="ed-serif truncate text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ed-text md:text-[36px]">{p.name}</h1>
              {p.roleLabel && <p className="text-[14.5px] text-ed-text-2">{p.roleLabel}</p>}
            </div>
          </div>
          <p className="ed-eyebrow mt-6">{p.levelLabel}</p>
          <dl className="mt-3 grid grid-cols-3 border-y border-ed-border">
            {p.stats.map((s, i) => (
              <div key={s.label} className={cn("py-3.5", i > 0 && "border-l border-ed-border pl-4")}>
                <dd className="ed-serif ed-numeral text-[28px] font-semibold leading-none text-ed-text">{s.value}</dd>
                <dt className="mt-1.5 text-[12px] text-ed-text-2">{s.label}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-4 max-w-[34ch] text-[13px] leading-relaxed text-ed-text-2">
            Signal has no account yet — your profile lives on this device with an anonymous ID.
          </p>
        </div>
      </motion.header>

      <div className="mt-10 lg:col-span-8 lg:mt-0">
        {/* Interests */}
        <Group id="interests" title="Your interests" note="Stories and answers lean toward these.">
          <Swap id={editInterests ? "edit" : "view"}>
          {!editInterests ? (
            <div className="border-t border-ed-text pt-4">
              {p.interests.length === 0 ? (
                <p className="text-[15.5px] text-ed-text-2">No interests chosen yet.</p>
              ) : (
                <ul className="flex flex-wrap gap-x-2 gap-y-1 text-[17px] text-ed-text">
                  {p.interests.map((i, idx) => (
                    <li key={i}>{i}{idx < p.interests.length - 1 && <span aria-hidden="true" className="text-ed-text-3">,</span>}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-center gap-4">
                <button type="button" className={linkBtn} onClick={() => setEditInterests(true)}>Edit interests</button>
                {savedNote === "interests" && <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, ease: EASE }} role="status" className="text-[13.5px] text-ed-positive">Saved</motion.span>}
              </div>
            </div>
          ) : (
            <div className="border-t border-ed-text pt-3">
              <ul className="grid sm:grid-cols-2 sm:gap-x-8">
                {p.allInterests.map((i) => {
                  const on = draft.includes(i);
                  return (
                    <li key={i} className="border-b border-ed-border">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => setDraft((d) => (on ? d.filter((x) => x !== i) : [...d, i]))}
                        className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-[16px] text-ed-text"
                      >
                        <span className={on ? "font-semibold" : ""}>{i}</span>
                        <span aria-hidden="true" className={cn("flex h-5 w-5 items-center justify-center rounded border", on ? "border-ed-accent-ink bg-ed-accent-ink text-ed-on-accent" : "border-ed-border-strong")}>
                          {on && (
                            <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.16, ease: EASE }} className="flex">
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            </motion.span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5 flex items-center gap-3">
                <button type="button" className={btnPrimary} disabled={savingInterests || draft.length === 0} onClick={saveInterests}>
                  {savingInterests ? "Saving…" : "Save interests"}
                </button>
                <button type="button" className={btnQuiet} onClick={() => setEditInterests(false)}>Cancel</button>
              </div>
              {draft.length === 0 && <p className="mt-2 text-[13px] text-ed-text-2">Pick at least one interest.</p>}
              {failed === "interests" && <p role="alert" className="mt-2 text-[13.5px] text-ed-negative">Couldn’t save your interests. Check your connection and try again.</p>}
            </div>
          )}
          </Swap>
        </Group>

        {/* What Signal knows */}
        <Group id="knows" title="Signal knows you" note="Learned from what you read, search and save on this device — nothing else.">
          <div className="border-t border-ed-text">
            {knowsNothing ? (
              <p className="py-4 text-[15.5px] leading-relaxed text-ed-text-2">
                Signal is still learning. Read, search and save a few stories and what it picks up will appear here.
              </p>
            ) : (
              <dl>
                {p.knows.topics.length > 0 && (
                  <div className="border-b border-ed-border py-4">
                    <dt className="ed-eyebrow">You read most about</dt>
                    <dd className="mt-1.5 text-[17px] leading-relaxed text-ed-text">{p.knows.topics.join(" · ")}</dd>
                  </div>
                )}
                {p.knows.concepts.length > 0 && (
                  <div className="border-b border-ed-border py-4">
                    <dt className="ed-eyebrow">Ideas you keep coming back to</dt>
                    <dd className="mt-1.5 text-[17px] leading-relaxed text-ed-text">{p.knows.concepts.join(" · ")}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </Group>

        {/* Your details */}
        {p.details && form && (
          <Group id="details" title="Your details">
            <Swap id={editDetails ? "edit" : "view"}>
            {!editDetails ? (
              <ul className="border-t border-ed-text">
                <ProfileRow label="Name" value={p.details.name || "—"} />
                <ProfileRow label="Role" value={p.options.roles.find((o) => o.value === p.details!.primary_role)?.label ?? "—"} />
                <ProfileRow label="Main goal" value={p.options.goals.find((o) => o.value === p.details!.primary_goal)?.label ?? "—"} />
                <ProfileRow label="Time per week" value={p.options.time.find((o) => o.value === p.details!.weekly_time_budget)?.label ?? "—"} />
                <ProfileRow label="AI experience" value={p.options.experience.find((o) => o.value === p.details!.experience_level)?.label ?? "—"} />
                <li className="flex items-center gap-4 border-b border-ed-border py-1">
                  <button type="button" className={linkBtn} onClick={() => setEditDetails(true)}>Edit details</button>
                  {savedNote === "details" && <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, ease: EASE }} role="status" className="text-[13.5px] text-ed-positive">Saved</motion.span>}
                </li>
              </ul>
            ) : (
                <form noValidate onSubmit={(e) => { e.preventDefault(); void saveDetails(); }} className="space-y-4 border-t border-ed-text pt-4">
                <Field label="Name" htmlFor="pf-name">
                  <input id="pf-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={selectCls} autoComplete="given-name" />
                </Field>
                <Field label="Role" htmlFor="pf-role"><Select id="pf-role" value={form.primary_role} options={p.options.roles} onChange={(v) => setForm({ ...form, primary_role: v })} /></Field>
                <Field label="Main goal" htmlFor="pf-goal"><Select id="pf-goal" value={form.primary_goal} options={p.options.goals} onChange={(v) => setForm({ ...form, primary_goal: v })} /></Field>
                <Field label="Time per week" htmlFor="pf-time"><Select id="pf-time" value={form.weekly_time_budget} options={p.options.time} onChange={(v) => setForm({ ...form, weekly_time_budget: v })} /></Field>
                <Field label="AI experience" htmlFor="pf-exp"><Select id="pf-exp" value={form.experience_level} options={p.options.experience} onChange={(v) => setForm({ ...form, experience_level: v })} /></Field>
                <div className="flex items-center gap-3 pt-1">
                  <button type="submit" className={btnPrimary} disabled={savingDetails}>{savingDetails ? "Saving…" : "Save details"}</button>
                  <button type="button" className={btnQuiet} onClick={() => setEditDetails(false)}>Cancel</button>
                </div>
                {failed === "details" && <p role="alert" className="text-[13.5px] text-ed-negative">Couldn’t save your details. Check your connection and try again.</p>}
              </form>
            )}
            </Swap>
          </Group>
        )}

        {/* Reading preferences */}
        <Group id="preferences" title="Reading preferences">
          <ul className="border-t border-ed-text">
            <ProfileRow
              label="Appearance"
              description="System follows your device."
              stacked
              control={
                <EdSegmented<ThemePref>
                  label="Appearance"
                  value={theme.pref}
                  onChange={theme.setPref}
                  options={[{ id: "light", label: "Light" }, { id: "dark", label: "Dark" }, { id: "system", label: "System" }]}
                />
              }
            />
          </ul>
        </Group>

        <Group id="notifications" title="Notifications">
          {!push.supported ? (
            <p className="border-t border-ed-text pt-4 text-[15px] leading-relaxed text-ed-text-2">{push.reason}</p>
          ) : (
            <>
              <ul className="border-t border-ed-text">
                <ProfileRow
                  label="Push notifications"
                  description="Only when something genuinely important drops."
                  control={<EdSwitch checked={push.on} onChange={push.onToggle} label="Push notifications" disabled={push.busy} />}
                />
                {push.error && <li role="alert" className="border-b border-ed-border py-3 text-[14px] text-ed-negative">{push.error}</li>}
                {push.blocked && (
                  <li className="border-b border-ed-border py-3 text-[14px] text-ed-negative">Blocked by your browser. Allow notifications for this site, then try again.</li>
                )}
                {push.on && (
                  <ProfileRow
                    label="Quiet mode"
                    description="Pause notifications without turning them off."
                    control={<EdSwitch checked={push.quiet} onChange={push.onQuiet} label="Quiet mode" />}
                  />
                )}
              </ul>
              {push.on && (
                <fieldset className="mt-6">
                  <legend className="ed-eyebrow">How often</legend>
                  <ul className="mt-2 border-t border-ed-border">
                    {push.levels.map((lv) => {
                      const sel = push.level === lv.id;
                      return (
                        <li key={lv.id} className="border-b border-ed-border">
                          <button
                            type="button"
                            role="radio"
                            aria-checked={sel}
                            onClick={() => push.onLevel(lv.id)}
                            className="flex min-h-[60px] w-full items-center gap-3 py-3 text-left"
                          >
                            <span aria-hidden="true" className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", sel ? "border-ed-accent-ink" : "border-ed-border-strong")}>
                              {sel && <span className="h-2.5 w-2.5 rounded-full bg-ed-accent-ink" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[16px] font-medium text-ed-text">{lv.label}</span>
                              <span className="block text-[13.5px] text-ed-text-2">{lv.desc}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              )}
            </>
          )}
        </Group>

        {/* Privacy & memory */}
        <Group
          id="memory"
          title="Privacy & memory"
          note="Signal remembers your profile, plus which stories you open, search for and save. It's tied to an anonymous ID on this device. Signal AI conversations are kept on this device only, never in your profile."
        >
          <ul className="border-t border-ed-text">
            <ProfileRow
              label="Clear Signal AI conversations"
              description="Removes past conversations from this device."
              value={cleared === "chats" ? "Cleared" : undefined}
              onClick={() => { p.onClearChats(); setCleared("chats"); }}
            />
            <ProfileRow
              label="Clear recent searches"
              description="Removes the list on the Search page."
              value={cleared === "searches" ? "Cleared" : undefined}
              onClick={() => { p.onClearSearches(); setCleared("searches"); }}
            />
            {confirm === "history" ? (
              <ConfirmRow
                text="Clear your reading history and streak? Saved stories stay."
                action="Clear history"
                onCancel={() => setConfirm("")}
                onConfirm={() => { p.onClearHistory(); setConfirm(""); setCleared("history"); }}
              />
            ) : (
              <ProfileRow
                label="Clear reading history"
                description="Resets your streak, counts and “read” markers."
                value={cleared === "history" ? "Cleared" : undefined}
                onClick={() => setConfirm("history")}
              />
            )}
            {confirm === "reset" ? (
              <ConfirmRow
                text="Reset Signal on this device? Your profile, saved stories and history are removed and you'll start onboarding again."
                action="Reset Signal"
                danger
                onCancel={() => setConfirm("")}
                onConfirm={p.onReset}
              />
            ) : (
              <ProfileRow label="Reset Signal" description="Wipe everything stored on this device." danger onClick={() => setConfirm("reset")} />
            )}
          </ul>
        </Group>

        {p.links.length > 0 && (
          <Group id="more" title="More from Signal">
            <ul className="border-t border-ed-text">
              {p.links.map((l) => (
                <li key={l.to} className="border-b border-ed-border">
                  <Link to={l.to} className="flex min-h-[60px] items-center justify-between gap-3 py-3 active:bg-ed-sunken">
                    <span className="min-w-0">
                      <span className="block text-[16px] font-medium text-ed-text">{l.label}</span>
                      <span className="block text-[13.5px] text-ed-text-2">{l.description}</span>
                    </span>
                    <span aria-hidden="true" className="text-ed-text-3">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Group>
        )}
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold text-ed-text-2">{label}</label>
      {children}
    </div>
  );
}

function Select({ id, value, options, onChange }: { id: string; value: string; options: Opt[]; onChange: (v: string) => void }) {
  const known = options.some((o) => o.value === value);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
      {!known && value && <option value={value}>{value}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ConfirmRow({ text, action, danger, onCancel, onConfirm }: { text: string; action: string; danger?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE }}
      className="border-b border-ed-border py-4"
      role="alertdialog"
      aria-label={action}
    >
      <p className="max-w-[52ch] text-[15px] leading-relaxed text-ed-text">{text}</p>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onConfirm}
          className={cn("inline-flex h-11 items-center rounded-lg px-5 text-[14.5px] font-semibold text-white transition-opacity hover:opacity-90", danger ? "bg-ed-negative" : "bg-ed-text !text-ed-bg")}
        >
          {action}
        </button>
        <button type="button" onClick={onCancel} className={btnQuiet}>Cancel</button>
      </div>
    </motion.li>
  );
}
