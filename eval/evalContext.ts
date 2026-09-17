import { csvColumn } from "./csv.js";
import { normalizeBool } from "./normalize.js";
import type { InferContext } from "./types.js";

type PriorMessage = { role: string; content: string };

function numberedJs(bodyLines: string[], startLine = 1): string {
  return bodyLines
    .map((line, i) => `${String(startLine + i).padStart(2, " ")}| ${line}`)
    .join("\n");
}

function files(sections: Array<{ path: string; body: string }>): string {
  return sections
    .map((section) => `--- ${section.path} ---\n${section.body}`)
    .join("\n\n");
}

function chat(messages: Array<[string, string]>): PriorMessage[] {
  return messages.map(([role, content]) => ({ role, content }));
}

function extractPathRefs(prompt: string): string[] {
  const found = new Set<string>();
  const md = /\[([^\]]+\.\w+)\]\([^)]+\)/gi;
  let match: RegExpExecArray | null;
  while ((match = md.exec(prompt)) !== null) {
    found.add(match[1]!);
  }
  const bare =
    /\b[\w./-]+\.(?:js|jsx|ts|tsx|go|py|lean|md|svg|png|ico|css|json)\b/gi;
  while ((match = bare.exec(prompt)) !== null) {
    found.add(match[0]);
  }
  return [...found];
}

const FLUX_CHAT = files([
  {
    path: "components/chat/MessageList.tsx",
    body: `export function MessageList({ messages, streaming }) {
  return messages.map((m) => (
    <div key={m.id} className="message">
      {m.content}
      {streaming && m.id === streaming ? <span className="cursor" /> : null}
    </div>
  ));
}
// After stream completes the last message is sometimes dropped from local state
// until a full page refresh reloads /api/chats/:id.`,
  },
  {
    path: "components/workspace/Navbar.tsx",
    body: `export function WorkspaceNavbar({ user, skeleton }) {
  return (
    <nav>
      {skeleton ? <NavbarSkeleton /> : <NavbarLinks user={user} />}
      <ThemeToggle />
    </nav>
  );
}
function NavbarSkeleton() {
  return <div className="h-12 animate-pulse bg-zinc-800" />;
}`,
  },
  {
    path: "components/ui/logo.tsx",
    body: `export function Logo() {
  return (
    <img
      src="/icon.png"
      width={18}
      className="transition-transform hover:scale-125 origin-left"
      alt="Flux"
    />
  );
}`,
  },
  {
    path: "app/page.tsx",
    body: `export default function Landing({ user }) {
  const cta = user ? "Try Flux" : "Try Flux";
  return (
    <header>
      <button className="active:scale-95">{cta}</button>
      <MoonIcon />
    </header>
  );
}`,
  },
  {
    path: "components/dashboard/WorkspaceCard.tsx",
    body: `export function WorkspaceCard() {
  return (
    <button className="menu-dots active:scale-90" aria-label="Open menu">
      ⋯
    </button>
  );
}`,
  },
  {
    path: "components/chat/PromptInput.tsx",
    body: `export function PromptInput({ value, generating, onStop }) {
  const empty = value.trim() === "";
  return (
    <button
      className={empty ? "opacity-40 rounded-md" : "rounded-md"}
      onClick={generating ? onStop : undefined}
    >
      {generating ? "stop" : "send"}
    </button>
  );
}`,
  },
  {
    path: "components/sources/EmptySources.tsx",
    body: `export function EmptySources() {
  return (
    <div>
      <p>Add your first source?</p>
      <p>Import a PDF, web page, YouTube video, or note</p>
      <span className="icon-wrap bg-zinc-700 active:scale-95">+</span>
      <button className="add-sources active:scale-95">Add sources</button>
    </div>
  );
}`,
  },
]);

const PORTFOLIO = files([
  {
    path: "app/page.tsx",
    body: `export default function Hero() {
  return (
    <section className="dot-grid-bg">
      <span className="pulse-green" />
      looking for internship roles
    </section>
  );
}`,
  },
  {
    path: "app/globals.css",
    body: `:root { --bg: #0b0b0f; --accent: #a78bfa; }
.dark { --bg: #050508; }
.dot-grid-bg { background-image: radial-gradient(#333 1px, transparent 1px); }`,
  },
  {
    path: "app/projects/page.tsx",
    body: `export default function Projects() {
  return <ul>{["flux", "axon"].map((p) => <li key={p}>{p}</li>)}</ul>;
}`,
  },
]);

const TICKETING = files([
  {
    path: "auth/src/routes/signup.ts",
    body: `router.post("/api/auth/signup", async (req, res) => {
  const { email, password } = req.body;
  const user = new User({ email, password });
  await user.save();
  res.status(201).send(user);
});`,
  },
  {
    path: "auth/src/models/user.ts",
    body: `const userSchema = new mongoose.Schema({
  email: String,
  password: String,
});
export const User = mongoose.model("User", userSchema);`,
  },
  {
    path: "infra/k8s/ingress.yaml",
    body: `spec:
  rules:
    - host: ticketing.dev
      http:
        paths:
          - path: /api/auth/signup
            pathType: Prefix`,
  },
]);

const POSTS_NGINX = files([
  {
    path: "infra/k8s/ingress-srv.yaml",
    body: `spec:
  rules:
    - host: posts.com
      http:
        paths:
          - path: /posts
            pathType: Prefix
            backend:
              service:
                name: posts-srv
                port: { number: 4000 }
          # missing path: /  → client app 503`,
  },
  {
    path: "client/Dockerfile",
    body: "FROM nginx:alpine\nCOPY dist /usr/share/nginx/html\n",
  },
]);

const EXPRESS_MICRO = files([
  {
    path: "orders/src/app.ts",
    body: `app.use("/api/orders", ordersRouter);
app.use((err, req, res, next) => {
  res.status(500).send({ message: err.message });
});`,
  },
  {
    path: "orders/src/errors/request-validation-error.ts",
    body: `export class RequestValidationError extends Error {
  statusCode = 400;
}`,
  },
  {
    path: "skaffold.yaml",
    body: "apiVersion: skaffold/v2alpha3\nkind: Config\n",
  },
]);

const BOOTLOADER = files([
  {
    path: "src/boot.s",
    body: `.section .multiboot
.align 4
.long 0x1BADB002
.long 0x00000003
.long -(0x1BADB002 + 0x00000003)
# Current header is Multiboot 1. Target is Multiboot 2 + UEFI.`,
  },
  {
    path: "tests/boot_test.rs",
    body: `#[test]
fn boots_in_qemu() { assert!(qemu_exit_code() == 0); }`,
  },
  {
    path: "PLAN.md",
    body: `# v0.2.0
- [ ] Multiboot2 header + UEFI entry
- [ ] Fix main compiler loop hanging on EOF
- [ ] Add parser and VM tests
`,
  },
]);

const COMPILER = files([
  {
    path: "PLAN.md",
    body: `# v0.2.0
1. Replace the busy-wait in the compiler loop with a work queue.
2. Add snapshot tests for parse → emit.
3. Do not start v0.3.0 items.`,
  },
  {
    path: "src/compiler_loop.c",
    body: `void compiler_loop(void) {
  for (;;) {
    Token t = next_token();
    if (t.kind == TOK_EOF) continue; /* bug: never exits */
    compile_one(t);
  }
}`,
  },
]);

const LINUX_README = files([
  {
    path: "README.md",
    body: `# Linux v3.0.1 tree (eval fixture)
Install skills with: \`skill install <git-url>\`
Then run \`skill status\` to confirm the humanizer skill is linked.`,
  },
  {
    path: "scripts/skill",
    body: `#!/bin/sh
# skill install <url> | skill status
`,
  },
]);

const BUN_BACKEND = files([
  {
    path: "src/index.ts",
    body: `import { Database } from "bun:sqlite";
const db = new Database("app.sqlite");
export function handle(req: Request) {
  return new Response("ok");
}`,
  },
  {
    path: "skills/humanizer.md",
    body: "Rewrite assistant text to sound less templated. Apply after JSON is serialized.",
  },
]);

const INDEX_JS_NPE = files([
  {
    path: "index.js",
    body: numberedJs(
      [
        "function handleRequest(req, res) {",
        "  const body = req.body;",
        ...Array.from({ length: 39 }, () => "  // ..."),
        "  const name = body.user.name;",
        "  res.json({ name });",
        "}",
        "module.exports = { handleRequest };",
      ],
      1,
    ),
  },
]);

const COMPONENT_JSX = files([
  {
    path: "component.jsx",
    body: `class Profile extends React.Component {
  componentWillMount() { this.fetch(); }
  componentWillReceiveProps(next) { if (next.id !== this.props.id) this.fetch(); }
  render() { return <div>{this.state.user}</div>; }
}`,
  },
]);

const CLIENT_GO = files([
  {
    path: "client.go",
    body: `func (c *Client) Do(req *http.Request) (*http.Response, error) {
  return c.http.Do(req) // no retry, no backoff
}`,
  },
]);

const CRON = files([
  {
    path: "infra/cron.yaml",
    body: `apiVersion: batch/v1
kind: CronJob
metadata: { name: nightly-rag-reindex }
spec:
  schedule: "0 3 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: reindex
              image: flux-worker
              args: ["reindex-sources"]`,
  },
  {
    path: "workers/reindex.ts",
    body: `export async function reindexSources() {
  await embedAllSources();
}`,
  },
]);

const AUTH_LOADING = files([
  {
    path: "app/login/page.tsx",
    body: `export function Login() {
  function onGoogle() { window.location.href = "/api/auth/google"; }
  return <button onClick={onGoogle}>Continue with Google</button>;
}`,
  },
  {
    path: "middleware.ts",
    body: `export function middleware(req) {
  if (!req.cookies.get("session") && req.nextUrl.pathname.startsWith("/app")) {
    return NextResponse.redirect("/login");
  }
}`,
  },
  {
    path: "hooks/useSession.ts",
    body: `export function useSession() {
  const [state, setState] = useState("loading");
  useEffect(() => {
    fetch("/api/me").then((r) => {
      if (!r.ok) setState("loading");
      else setState("ready");
    });
  }, []);
  return state;
}`,
  },
]);

const LEAN_LANG = files([
  {
    path: "Regular/Basics/NonRegular.lean",
    body: `theorem anbn_not_regular : ¬ Regular (anbn) := by
  sorry
-- Should move into Regular/Examples/AnBn.lean; this file becomes a wrapper.`,
  },
  {
    path: "README.md",
    body: `# langlib
CSL substitution closure is not documented.
CFL ⊂ CSL is not stated.
API docs: https://nielstron.github.io/langlib/api/Langlib.html
Theme: just-the-docs, color lilac (#c8a2c8).
Nav: Home, API (missing docs link).
`,
  },
]);

const GRAFANA = files([
  {
    path: "deploy/docker-compose.yml",
    body: `services:
  grafana:
    image: grafana/grafana:11.1.0
    ports: ["3000:3000"]
    # no retention / storage limits yet
  prometheus:
    image: prom/prometheus
    volumes: ["./prometheus.yml:/etc/prometheus/prometheus.yml"]`,
  },
  {
    path: "deploy/host.txt",
    body: "hostname: eval-box\nram: 16GB\narch: x86_64\n",
  },
]);

const NEXT_AUDIT = files([
  {
    path: "package.json",
    body: `{ "name": "flux", "dependencies": { "next": "15.0.0", "react": "19.0.0" } }`,
  },
  {
    path: "app/layout.tsx",
    body: `"use client";
export default function RootLayout({ children }) {
  useEffect(() => { fetch("/api/me"); }, []);
  return <html>{children}</html>;
}`,
  },
  {
    path: "lib/api.ts",
    body: `export function useWorkspace() {
  const [data, setData] = useState();
  useEffect(() => { fetch("/api/workspace").then(r => r.json()).then(setData); }, []);
  return data;
}`,
  },
]);

const OPNSHIN = files([
  {
    path: "compiler.py",
    body: `class Compiler(NodeVisitor):
    def visit_Module(self, node):
        return [self.visit(s) for s in node.body]`,
  },
  {
    path: "tests/test_misc.py",
    body: `def test_add():
    assert compile_and_eval("1 + 1") == 2`,
  },
  {
    path: "type_inference.py",
    body: `def infer(node): return "int"`,
  },
]);

const UNRELATED = files([
  {
    path: "lib/formatDate.ts",
    body: `export function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}`,
  },
  {
    path: "README.md",
    body: "Utility helpers. No product feature work is specified in this snapshot.",
  },
]);

type Fixture = {
  match: (prompt: string) => boolean;
  resolve: boolean;
  prior: PriorMessage[];
  code: string;
};

const FIXTURES: Fixture[] = [
  {
    match: (p) => /disappears after the completion|chat UI/i.test(p),
    resolve: true,
    prior: chat([
      [
        "user",
        "We're on the Flux workspace chat. Streaming uses MessageList and /api/chats/:id.",
      ],
      [
        "assistant",
        "I have MessageList.tsx open. After TEXT_END the cursor span unmounts and the last message is removed from Zustand until refresh.",
      ],
    ]),
    code: FLUX_CHAT,
  },
  {
    match: (p) =>
      /navbar of the workspace|landing page isnt accessible|Try Flux/i.test(p) &&
      /skeleton|Open App|moon icon/i.test(p),
    resolve: true,
    prior: chat([
      [
        "user",
        "Landing, dashboard, and workspace navbars should share one component. Logged-in landing CTA is Open App.",
      ],
    ]),
    code: FLUX_CHAT,
  },
  {
    match: (p) => /create artifact tools cards|Add your first source/i.test(p),
    resolve: true,
    prior: chat([["user", "Keep the theme toggle animation. Only click scale-down ripples go."]]),
    code: FLUX_CHAT,
  },
  {
    match: (p) => /similar click animations is ther on multiple places/i.test(p),
    resolve: true,
    prior: chat([["user", "Same Flux app. Landing still shows Try Flux after login until refresh."]]),
    code: FLUX_CHAT,
  },
  {
    match: (p) => /three dot menu button on the workspace card/i.test(p),
    resolve: true,
    prior: chat([["user", "Dashboard workspace cards, not the chat composer."]]),
    code: FLUX_CHAT,
  },
  {
    match: (p) => /icon in the nav bar is looking small/i.test(p),
    resolve: true,
    prior: chat([
      [
        "user",
        "Previous PNG was 28px wide. Update components/ui/logo.tsx to set width={28} so it stays consistent wherever Logo is imported.",
      ],
    ]),
    code: files([
      {
        path: "components/workspace/Navbar.tsx",
        body: `import { Logo } from "@/components/ui/logo";

export function WorkspaceNavbar({ user, skeleton }) {
  return (
    <nav className="flex items-center gap-4">
      <Logo />
      {skeleton ? <NavbarSkeleton /> : <NavbarLinks user={user} />}
      <ThemeToggle />
    </nav>
  );
}
function NavbarSkeleton() {
  return <div className="h-12 animate-pulse bg-zinc-800" />;
}`,
      },
      {
        path: "components/ui/logo.tsx",
        body: `export function Logo() {
  return (
    <img
      src="/icon.png"
      width={18}
      className="transition-transform hover:scale-125 origin-left"
      alt="Flux"
    />
  );
}`,
      },
    ]),
  },
  {
    match: (p) => /icon\.svg|logo\.tsx|favicon\.ico|apple-icon/i.test(p),
    resolve: true,
    prior: chat([["user", "Switch the brand asset from SVG to PNG across app/ and components/ui/logo.tsx."]]),
    code: files([
      {
        path: "components/ui/logo.tsx",
        body: `import icon from "../app/icon.svg";
export function Logo() { return <img src={icon} width={18} />; }`,
      },
      { path: "app/icon.svg", body: "<svg viewBox='0 0 32 32'></svg>" },
      { path: "app/icon.png", body: "<binary png 32x32>" },
    ]),
  },
  {
    match: (p) => /same navbar on the landing page on the dashboard/i.test(p),
    resolve: true,
    prior: chat([["assistant", "There are three navbar implementations: landing/Header, dashboard/TopNav, workspace/Navbar."]]),
    code: FLUX_CHAT,
  },
  {
    match: (p) => /remove expanding animation from the logo/i.test(p),
    resolve: true,
    prior: chat([["user", "The hover scale on components/ui/logo.tsx, not the page transition."]]),
    code: FLUX_CHAT,
  },
  {
    match: (p) => /pulsating green dot|looking for internship roles/i.test(p),
    resolve: true,
    prior: chat([["user", "Hero status line on the portfolio, not the blog."]]),
    code: PORTFOLIO,
  },
  {
    match: (p) => /analytics feature For this application/i.test(p),
    resolve: false,
    prior: chat([["user", "We might want metrics someday. No vendor or events chosen."]]),
    code: NEXT_AUDIT,
  },
  {
    match: (p) => /redesign this portfolio website completely/i.test(p),
    resolve: true,
    prior: chat([["user", "Current site is a single-page portfolio with a GitHub heatmap and a projects list."]]),
    code: PORTFOLIO,
  },
  {
    match: (p) => /404 page og image generation/i.test(p),
    resolve: true,
    prior: chat([
      [
        "user",
        "For 404 OG image: generate an OpenGraph image at app/not-found/opengraph-image.tsx with title '404 - Page Not Found' and subtitle 'Return to Home' using @vercel/og ImageResponse. For Nerve brand: add a 1.05 scale hover transition (duration-200) to the Nerve logo span in Navbar. For hero background: add a 24px SVG dot-grid pattern with #222 dot color in globals.css. Document /not-found in sitemap.xml and README.",
      ],
    ]),
    code: files([
      {
        path: "app/not-found.tsx",
        body: `export default function NotFound() {
  return (
    <div>
      <h1>404 - Page Not Found</h1>
      <a href="/">Return to Home</a>
    </div>
  );
}`,
      },
      {
        path: "components/Navbar.tsx",
        body: `export function Navbar() {
  return (
    <nav className="flex items-center justify-between p-4">
      <span className="font-bold tracking-tight">Nerve</span>
      <div className="flex gap-4">
        <a href="/">Home</a>
        <a href="/projects">Projects</a>
      </div>
    </nav>
  );
}`,
      },
      {
        path: "app/globals.css",
        body: `:root { --bg: #0b0b0f; --accent: #a78bfa; }
.dark { --bg: #050508; }
.dot-grid-bg { background-image: radial-gradient(#333 1px, transparent 1px); }`,
      },
    ]),
  },
  {
    match: (p) => /dot grid background completely/i.test(p),
    resolve: true,
    prior: chat([
      [
        "user",
        "In app/globals.css, delete the .dot-grid-bg utility entirely. For dark theme, update .dark tokens to: --bg: #09090b, --surface: #18181b, --border: #27272a, and --accent: #38bdf8 with contrast ratio >= 4.5:1 against text #f4f4f5.",
      ],
    ]),
    code: files([
      {
        path: "app/globals.css",
        body: `:root {
  --bg: #0b0b0f;
  --surface: #18181b;
  --border: #27272a;
  --accent: #38bdf8;
}
.dark {
  --bg: #09090b;
  --surface: #18181b;
  --border: #27272a;
  --accent: #38bdf8;
}
.dot-grid-bg {
  background-image: radial-gradient(#222 1px, transparent 1px);
}`,
      },
      {
        path: "app/page.tsx",
        body: `export default function Hero() {
  return (
    <section className="dot-grid-bg">
      <span className="pulse-green" />
      looking for internship roles
    </section>
  );
}`,
      },
    ]),
  },
  {
    match: (p) => /ticketing\.dev\/api\/auth\/signup/i.test(p),
    resolve: true,
    prior: chat([["user", "Windows hosts already maps ticketing.dev. Signup should POST JSON {email,password}."]]),
    code: TICKETING,
  },
  {
    match: (p) => /dont complete them yet, neither add a db connection/i.test(p),
    resolve: true,
    prior: chat([
      [
        "user",
        "Standard error format must be JSON: { errors: [{ message: string, field?: string }] }. Create a CustomError abstract base class with statusCode: number and serializeErrors(): { message: string, field?: string }[], have RequestValidationError and NotFoundError extend it, and update the global error-handling middleware in orders/src/app.ts to return this format.",
      ],
    ]),
    code: files([
      {
        path: "orders/src/app.ts",
        body: `import express from "express";
import { json } from "body-parser";
import { errorHandler } from "./middlewares/error-handler";

const app = express();
app.use(json());
app.use(errorHandler);
export { app };`,
      },
      {
        path: "orders/src/middlewares/error-handler.ts",
        body: `import { Request, Response, NextFunction } from "express";

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).send({ message: err.message });
};`,
      },
      {
        path: "orders/src/errors/request-validation-error.ts",
        body: `export class RequestValidationError extends Error {
  statusCode = 400;
  constructor() {
    super("Invalid request parameters");
  }
}`,
      },
    ]),
  },
  {
    match: (p) => /posts\.com/i.test(p),
    resolve: true,
    prior: chat([["user", "hosts file has posts.com. /posts works; / hits nginx 503."]]),
    code: POSTS_NGINX,
  },
  {
    match: (p) => /point of cron job in this project/i.test(p),
    resolve: true,
    prior: chat([["user", "This is the Flux repo. I mean the nightly job, not GitHub Actions."]]),
    code: CRON,
  },
  {
    match: (p) => /clear cookies when logged in/i.test(p),
    resolve: true,
    prior: chat([["user", "Clearing the session cookie on /app leaves useSession() stuck on 'loading'."]]),
    code: AUTH_LOADING,
  },
  {
    match: (p) => /google oauth and is waiting/i.test(p),
    resolve: true,
    prior: chat([["user", "Login page Continue with Google — no pending UI before the redirect."]]),
    code: AUTH_LOADING,
  },
  {
    match: (p) => /color of the button we discussed/i.test(p),
    resolve: false,
    prior: chat([
      ["user", "The new palette is #0F172A / #38BDF8."],
      ["assistant", "Noted. Several buttons still use the old purple."],
    ]),
    code: FLUX_CHAT,
  },
  {
    match: (p) => /multiboot 2/i.test(p),
    resolve: true,
    prior: chat([["user", "QEMU boots today with Multiboot 1. I need UEFI + Multiboot 2 then the existing qemu test."]]),
    code: BOOTLOADER,
  },
  {
    match: (p) => /see PLAN, do v0\.2\.0/i.test(p),
    resolve: true,
    prior: chat([["user", "PLAN.md is in the repo root. Compiler loop is src/compiler_loop.c."]]),
    code: COMPILER,
  },
  {
    match: (p) => /Linux v3\.0\.1 so read README first/i.test(p),
    resolve: true,
    prior: chat([["user", "Use the skill CLI documented in README, then status."]]),
    code: LINUX_README,
  },
  {
    match: (p) => /bun backend that uses the databases/i.test(p),
    resolve: true,
    prior: chat([
      [
        "user",
        "Build a REST API in src/index.ts using Bun.serve() with bun:sqlite for a 'notes' table (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, created_at DATETIME). Implement GET /api/notes, POST /api/notes, and GET /api/notes/:id. In the response handler, run the generated note summary through the humanizer skill before returning.",
      ],
    ]),
    code: files([
      {
        path: "src/index.ts",
        body: `import { Database } from "bun:sqlite";

const db = new Database("app.sqlite");
db.run(\`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
\`);

export default {
  port: 3000,
  fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/notes")) {
      return new Response("ok");
    }
    return new Response("not found", { status: 404 });
  },
};`,
      },
      {
        path: "skills/humanizer.md",
        body: "Rewrite assistant text to sound less templated. Apply after JSON is serialized.",
      },
    ]),
  },
  {
    match: (p) => /blader\/humanizer/i.test(p),
    resolve: true,
    prior: chat([["user", "Skill installer is already on PATH. After install, run skill status."]]),
    code: LINUX_README,
  },
  {
    match: (p) => /PROJECT\.MD with milestones for the entire codebase/i.test(p),
    resolve: true,
    prior: chat([
      [
        "user",
        "We are building 'NotepadX', an offline-first markdown notes app with local SQLite sync. Milestone 1: Core editor with CodeMirror and local IndexedDB cache. Milestone 2: Cloud sync server via Hono + Drizzle ORM. Milestone 3: End-to-end encryption with WebCrypto AES-GCM. Milestone 4: Collaborative live cursors via WebSockets. Write PROJECT.MD in repo root detailing deliverables, dependencies, and completion criteria for these 4 milestones.",
      ],
    ]),
    code: files([
      {
        path: "package.json",
        body: JSON.stringify(
          {
            name: "notepadx",
            version: "0.1.0",
            dependencies: {
              next: "15.0.0",
              codemirror: "6.0.1",
            },
          },
          null,
          2,
        ),
      },
      {
        path: "README.md",
        body: "# NotepadX\nOffline-first markdown notes app with local SQLite sync.\n",
      },
    ]),
  },
  {
    match: (p) => /change all variable names throughout the system/i.test(p),
    resolve: true,
    prior: chat([
      [
        "user",
        "Execute Stage 1 of the style guide migration: convert all snake_case variable, parameter, and property names to camelCase across orders/src/ (e.g. order_id -> orderId, user_email -> userEmail, created_at -> createdAt). Do not rename exported API routes, environment variables, or database column string literals.",
      ],
    ]),
    code: files([
      {
        path: "orders/src/models/order.ts",
        body: `export interface Order {
  order_id: string;
  user_id: string;
  user_email: string;
  total_price: number;
  created_at: string;
}`,
      },
      {
        path: "orders/src/services/orders-service.ts",
        body: `export function calculate_tax(sub_total: number, tax_rate: number): number {
  const item_tax = sub_total * tax_rate;
  return item_tax;
}`,
      },
    ]),
  },
  {
    match: (p) => /check every single file in the project globally/i.test(p),
    resolve: true,
    prior: chat([
      [
        "user",
        "For Stage 4 test-audit in the CI pipeline: recursively traverse all source files under orders/src/ and auth/src/, verify each file has a corresponding *.test.ts file under __tests__/, and generate a coverage gap report. This automated check gates the Stage 5 deploy — missing tests block release unless overridden.",
      ],
    ]),
    code: files([
      {
        path: "orders/src/app.ts",
        body: `import express from "express";\nexport const app = express();`,
      },
      {
        path: "orders/src/__tests__/app.test.ts",
        body: `import { app } from "../app";\ntest("app starts", () => {});`,
      },
      {
        path: "orders/src/services/billing.ts",
        body: `export function processBilling(orderId: string, amount: number) {\n  return { charged: true, orderId, amount };\n}`,
      },
    ]),
  },
  {
    match: (p) => /CLAUDE\.MD and a PLAN\.MD for system-wide/i.test(p),
    resolve: true,
    prior: chat([
      [
        "user",
        "Create CLAUDE.MD and PLAN.MD documenting our repo standards: package manager is pnpm; typecheck is 'pnpm run typecheck' (tsc --noEmit); unit tests are 'pnpm run test' (vitest run); lint is 'pnpm run lint' (biome check .). Deployment runs via 'pnpm run build' generating Next.js standalone output to .next/standalone.",
      ],
    ]),
    code: files([
      {
        path: "package.json",
        body: JSON.stringify(
          {
            name: "monorepo-root",
            scripts: {
              typecheck: "tsc --noEmit",
              test: "vitest run",
              lint: "biome check .",
              build: "next build",
            },
          },
          null,
          2,
        ),
      },
      {
        path: "biome.json",
        body: JSON.stringify(
          {
            $schema: "https://biomejs.dev/schemas/1.8.3/schema.json",
            linter: { enabled: true },
            formatter: { enabled: true, indentStyle: "space", indentWidth: 2 },
          },
          null,
          2,
        ),
      },
    ]),
  },
  {
    match: (p) => /verify throughout the entire codebase that all tests pass/i.test(p),
    resolve: true,
    prior: chat([
      [
        "user",
        "Run the full test suite across the monorepo: run 'npm test' in auth/ (Jest unit tests) and 'npm run test:e2e' in orders/ (Playwright integration tests against local mock). Verify all tests pass, identify any failing test cases, and summarize module health.",
      ],
    ]),
    code: files([
      {
        path: "auth/package.json",
        body: JSON.stringify(
          {
            name: "auth",
            scripts: {
              test: "jest",
            },
          },
          null,
          2,
        ),
      },
      {
        path: "orders/package.json",
        body: JSON.stringify(
          {
            name: "orders",
            scripts: {
              "test:e2e": "playwright test",
            },
          },
          null,
          2,
        ),
      },
      {
        path: "orders/playwright.config.ts",
        body: `import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
});`,
      },
    ]),
  },
  {
    match: (p) => /null pointer exception on line 42 of index\.js/i.test(p),
    resolve: true,
    prior: chat([["user", "handleRequest crashes when body.user is missing."]]),
    code: INDEX_JS_NPE,
  },
  {
    match: (p) => /deprecated react lifecycle methods in component\.jsx/i.test(p),
    resolve: true,
    prior: chat([["user", "Profile class component in component.jsx."]]),
    code: COMPONENT_JSX,
  },
  {
    match: (p) => /exponential backoff in client\.go/i.test(p),
    resolve: true,
    prior: chat([["user", "HTTP client in client.go. Retry 5xx and timeouts only."]]),
    code: CLIENT_GO,
  },
  {
    match: (p) => /^go on$/i.test(p.trim()),
    resolve: false,
    prior: chat([
      ["user", "This repo is a mix of scripts."],
      ["assistant", "I can help with a lot of things. What should we do?"],
    ]),
    code: UNRELATED,
  },
  {
    match: (p) => /leanstral 1\.5 on this server/i.test(p),
    resolve: true,
    prior: chat([["user", "This is eval-box. Check VRAM before pulling the 1.5 checkpoint."]]),
    code: files([
      {
        path: "host/inventory.txt",
        body: "GPU: NVIDIA A4000 16GB\nCUDA: 12.4\nRAM: 64GB\nDisk free: 400GB\nOS: Ubuntu 22.04",
      },
    ]),
  },
  {
    match: (p) => /just the docs theme light blue instead of lilac/i.test(p),
    resolve: true,
    prior: chat([["user", "just-the-docs config lives in _config.yml. Color is currently lilac."]]),
    code: LEAN_LANG,
  },
  {
    match: (p) => /Regular\/Basics\/NonRegular/i.test(p),
    resolve: true,
    prior: chat([["user", "Follow the same example layout as Regular/Examples/Even.lean."]]),
    code: LEAN_LANG,
  },
  {
    match: (p) => /CSLs are not closed under substitution/i.test(p),
    resolve: true,
    prior: chat([["user", "README has a Formal languages section with a placeholder link."]]),
    code: LEAN_LANG,
  },
  {
    match: (p) => /work on this for at least 8 hours before giving up/i.test(p),
    resolve: false,
    prior: chat([["user", "You are in a research repo. No specific conjecture was selected this turn."]]),
    code: LEAN_LANG,
  },
  {
    match: (p) => /Černý|Cerny|Äern/i.test(p),
    resolve: true,
    prior: chat([["user", "Lean 4 + mathlib. The statement is in FormalLanguages/Cerny.lean as a sorry."]]),
    code: files([
      {
        path: "FormalLanguages/Cerny.lean",
        body: `/-- Černý conjecture: reset word length ≤ n² for synchronizing automata. -/
theorem cerny (A : Automaton) (h : Synchronizing A) : resetBound A ≤ A.size ^ 2 := by
  sorry`,
      },
    ]),
  },
  {
    match: (p) => /List_of_unsolved_problems_in_computer_science/i.test(p),
    resolve: false,
    prior: chat([["user", "Wikipedia list is long. I have not picked a problem."]]),
    code: LEAN_LANG,
  },
  {
    match: (p) => /set up grafana on this server/i.test(p),
    resolve: true,
    prior: chat([["user", "Prometheus is already in docker-compose. Grafana should bind localhost:3000 only."]]),
    code: GRAFANA,
  },
  {
    match: (p) => /customer who is unsatisfied/i.test(p),
    resolve: true,
    prior: chat([
      [
        "user",
        "Customer Maya bought the Pro plan yesterday. Charge went through twice. She emailed: 'I want this fixed today or I cancel.'",
      ],
    ]),
    code: files([{ path: "brand/voice.md", body: "Tone: calm, specific, no legal threats. Offer a refund of the duplicate charge." }]),
  },
  {
    match: (p) => /set of eight numbers/i.test(p),
    resolve: true,
    prior: chat([["user", "Keep them in numeric order. One sentence, no list punctuation besides commas."]]),
    code: UNRELATED,
  },
  {
    match: (p) => /three years of working experience/i.test(p),
    resolve: true,
    prior: chat([["user", "Role: junior SRE. Team wants the requirement explained, not rewritten."]]),
    code: UNRELATED,
  },
  {
    match: (p) => /language transpiler of smart contracts|visitor pattern/i.test(p),
    resolve: false,
    prior: chat([["user", "Standing compiler rules only. No language feature named this turn."]]),
    code: OPNSHIN,
  },
  {
    match: (p) => /AGENTS\.md instructions/i.test(p),
    resolve: false,
    prior: chat([["user", "These are standing repo instructions. There is no feature or bug in this message."]]),
    code: OPNSHIN,
  },
  {
    match: (p) => /Never\*\* revert a change I made during a session/i.test(p),
    resolve: false,
    prior: chat([["user", "Workflow rules only. No file or behavior was requested."]]),
    code: OPNSHIN,
  },
  {
    match: (p) => /tweet that addresses the issue of environmental degradation/i.test(p),
    resolve: true,
    prior: chat([["user", "Campaign: city heat islands. Account is @evalcity. Publish-ready, 280 chars."]]),
    code: files([{ path: "campaign/brief.md", body: "Do not mention competitors. Include one concrete local action." }]),
  },
  {
    match: (p) => /figure of speech/i.test(p),
    resolve: false,
    prior: chat([["user", "I like vivid writing."]]),
    code: UNRELATED,
  },
  {
    match: (p) => /JavaScript function that takes in a string and returns an object/i.test(p),
    resolve: true,
    prior: chat([["user", "Plain JS, no libraries. Count every character including spaces."]]),
    code: files([{ path: "exercises/README.md", body: "Kata: character frequencies. Return a plain object." }]),
  },
  {
    match: (p) => /Rewrite the given sentence so it uses a different verb/i.test(p),
    resolve: true,
    prior: chat([["user", "Given sentence: The engineer shipped the patch before noon."]]),
    code: UNRELATED,
  },
  {
    match: (p) => /As he looked out into the horizon/i.test(p),
    resolve: true,
    prior: chat([["user", "Keep it under 400 words. Third person. No sci-fi."]]),
    code: UNRELATED,
  },
  {
    match: (p) => /create 2 sub-goals that would help the person achieve the ultimate goal/i.test(p),
    resolve: false,
    prior: chat([["user", "I have a goal in mind but I did not write it down."]]),
    code: UNRELATED,
  },
  {
    match: (p) => /web-based learning systems/i.test(p),
    resolve: true,
    prior: chat([["user", "Compare Moodle, Canvas, and a static docs site. Chart can be markdown."]]),
    code: UNRELATED,
  },
  {
    match: (p) => /task that a GPT model can complete with a given input and output/i.test(p),
    resolve: false,
    prior: chat([["user", "I will paste the input/output pair later."]]),
    code: UNRELATED,
  },
  {
    match: (p) => /Do Phase 1 only|audit and optimize the existing frontend/i.test(p),
    resolve: true,
    prior: chat([["user", "Approved Flux UI. Do not change visuals. Start with the API waterfall in lib/api.ts."]]),
    code: NEXT_AUDIT,
  },
  {
    match: (p) => /analyze the complete chat frontend, backend, how the llm/i.test(p),
    resolve: false,
    prior: chat([["user", "Something feels off in chat, RAG, and tools. I have not named a failing case."]]),
    code: FLUX_CHAT,
  },
];

function fallback(prompt: string, unclear: boolean): InferContext {
  const refs = extractPathRefs(prompt);
  const code =
    refs.length > 0
      ? files(
          refs.slice(0, 6).map((path) => ({
            path,
            body: unclear
              ? `// ${path} is in the tree. No specific change is indicated.`
              : `// ${path}\nexport function entry() { return "${path}"; }\n`,
          })),
        )
      : unclear
        ? UNRELATED
        : files([
            {
              path: "src/app.ts",
              body: `// Representative module for: ${prompt.slice(0, 180)}\nexport function run() {}\n`,
            },
          ]);
  const prior = unclear
    ? chat([["user", "We were looking at this repo earlier. I still have not named the exact change."]])
    : chat([
        [
          "user",
          `Earlier we scoped this to the attached files. The action is: ${prompt.slice(0, 240)}`,
        ],
      ]);
  return { priorMessages: prior, codeContext: code };
}

function pickFixture(prompt: string): Fixture | undefined {
  return FIXTURES.find((fixture) => fixture.match(prompt));
}

function parsePriorOverride(raw: string): PriorMessage[] {
  const parsed: unknown = JSON.parse(raw.trim());
  if (!Array.isArray(parsed)) {
    throw new Error("prior_messages must be a JSON array");
  }
  return parsed.map((item) => {
    if (item === null || typeof item !== "object") {
      throw new Error("prior_messages entries must be objects");
    }
    const record = item as { role?: unknown; content?: unknown };
    if (typeof record.role !== "string" || typeof record.content !== "string") {
      throw new Error("prior_messages entries need string role and content");
    }
    return { role: record.role, content: record.content };
  });
}

export function contextForEvalRow(row: Record<string, string>): InferContext | undefined {
  if (normalizeBool(csvColumn(row, "context")) !== true) {
    return undefined;
  }

  const codeOverride = csvColumn(row, "code_context").trim();
  const priorRaw = csvColumn(row, "prior_messages").trim();
  if (codeOverride !== "" || priorRaw !== "") {
    const ctx: InferContext = {};
    if (priorRaw !== "") {
      ctx.priorMessages = parsePriorOverride(priorRaw);
    }
    if (codeOverride !== "") {
      ctx.codeContext = codeOverride;
    }
    return ctx;
  }

  const prompt = csvColumn(row, "prompt");
  const unclear = csvColumn(row, "human_ambiguity").trim().toLowerCase() === "unclear";
  const fixture = pickFixture(prompt);
  if (fixture !== undefined) {
    if (unclear && fixture.resolve) {
      return fallback(prompt, true);
    }
    return { priorMessages: fixture.prior, codeContext: fixture.code };
  }
  return fallback(prompt, unclear);
}

export function contextLooksLikeStub(ctx: InferContext | undefined): boolean {
  if (ctx === undefined) {
    return false;
  }
  const code = ctx.codeContext ?? "";
  const prior = (ctx.priorMessages ?? []).map((m) => m.content).join("\n");
  return (
    code.includes("[eval] project files") ||
    prior.includes("[eval] older chat context")
  );
}
