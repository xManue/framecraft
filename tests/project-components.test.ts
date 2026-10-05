import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";
import { buildProjectIndex, projectComponentJsx } from "../src/core/projectIndex";

describe("project component palette", () => {
  it("finds the project's exported components and keeps literal props from real usage", () => {
    const sources = {
      "C:/panel/MachineCommand.jsx": `export default function MachineCommand({ label, size }) { return <button style={{ width: size }}>{label}</button>; }`,
      "C:/panel/StatusLamp.jsx": `export function StatusLamp({ active }) { return <i data-active={active} />; }`,
      "C:/panel/Page.jsx": `import Command from "./MachineCommand";\nimport { StatusLamp as Lamp } from "./StatusLamp";\nexport default function Page() { return <main><Command label="AVVIA" size={140} /><Lamp active /></main>; }`,
    };
    const components = buildProjectIndex(sources).components();
    expect(components.find((item) => item.name === "MachineCommand")).toMatchObject({ usageCount: 1, exampleProps: { label: '"AVVIA"', size: "140" } });
    expect(components.find((item) => item.name === "StatusLamp")).toMatchObject({ usageCount: 1, exampleProps: { active: "true" } });

    const transported = projectComponentJsx(components.find((item) => item.name === "MachineCommand")!);
    const jsx = transported.replace(/^\/\*framecraft-project:[^*]+\*\/\s*/, "");
    expect(jsx).toContain('label="AVVIA"');
    expect(jsx).toContain("size={140}");
    expect(() => parse(`function Preview() { return (${jsx}); }`, { sourceType: "module", plugins: ["jsx"] })).not.toThrow();
  });
});
