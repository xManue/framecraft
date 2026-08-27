import { describe, expect, it } from "vitest";
import { detectPages, insertReactRoute } from "../src/core/pages";

const root = "C:\\project\\src";
const appFile = `${root}\\App.tsx`;
const homeFile = `${root}\\pages\\HomePage.tsx`;
const app = `import { Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
export function App() {
  return <Routes><Route path="/" element={<HomePage />} /></Routes>;
}`;

describe("React Router page model", () => {
  it("maps routes to the source page users actually edit", () => {
    const result = detectPages({ [appFile]: app, [homeFile]: "export const HomePage = () => <main>Home</main>;" });
    expect(result.routerEditable).toBe(true);
    expect(result.routerFile).toBe(appFile);
    expect(result.pages).toEqual([expect.objectContaining({ name: "Home", route: "/", file: homeFile })]);
  });

  it("adds a page import and route without rebuilding existing code", () => {
    const result = insertReactRoute(app, "ContactPage", "./pages/ContactPage", "/contact");
    expect(result).toContain('import { ContactPage } from "./pages/ContactPage";');
    expect(result).toContain('<Route path="/contact" element={<ContactPage />} />');
    expect(result).toContain('<Route path="/" element={<HomePage />} />');
  });

  it("recognizes lazy alias imports and nested index routes", () => {
    const dashboardFile = `${root}\\pages\\Dashboard.tsx`;
    const source = `import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
const Dashboard = lazy(() => import("@/pages/Dashboard"));
export const App = () => <Routes><Route element={<section />}><Route index element={<Suspense><Dashboard /></Suspense>} /></Route></Routes>;`;
    const result = detectPages({ [appFile]: source, [dashboardFile]: "export default function Dashboard() { return <main />; }" });
    expect(result.pages[0]).toEqual(expect.objectContaining({ name: "Dashboard", route: "/", file: dashboardFile }));
  });

  it("detects screens controlled by React state when there is no router", () => {
    const source = `import { useState } from "react";
const directPages = { settings: ["Settings"], statistics: ["Statistics"], formats: ["Formats"] };
export default function App() {
  const [currentPage, setCurrentPage] = useState("machine-view");
  const alarm = (mode) => setCurrentPage(mode === "history" ? "history" : "alarms");
  return <PanelPage page={currentPage} />;
}
function PanelPage({ page }) {
  if (page === "counter-machine") return <main />;
  if (page === "consumption") return <main />;
  if (page === "manual-general") return <main />;
  if (directPages[page]) return <main />;
  return null;
}`;
    const result = detectPages({ [appFile]: source });
    expect(result.routerEditable).toBe(false);
    expect(result.pages.map((page) => page.stateValue)).toEqual(expect.arrayContaining([
      "machine-view", "counter-machine", "consumption", "manual-general", "history", "alarms", "settings", "statistics", "formats",
    ]));
    expect(result.pages[0]).toEqual(expect.objectContaining({ name: "Machine View", route: "/", stateValue: "machine-view" }));
  });

  it("shows the app as Home when no navigation model is present", () => {
    const result = detectPages({ [appFile]: "export default function App() { return <main>Hello</main>; }" });
    expect(result.pages).toEqual([expect.objectContaining({ name: "Home", route: "/", file: appFile })]);
  });
});
