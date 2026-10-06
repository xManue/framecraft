import { describe, expect, it } from "vitest";
import { filterProjectFiles, projectFileKind, projectImageUrl } from "../src/core/projectFiles";

describe("file del progetto", () => {
  it.each([['Page.tsx', 'source'], ['Page.JSX', 'source'], ['motor.png', 'image'], ['motor.svg', 'image'], ['framecraft.plc.json', 'text'], ['layout.css', 'text'], ['README.md', 'text'], ['program.exe', 'unsupported'], ['archive.zip', 'unsupported']])("riconosce %s come %s", (path, kind) => {
    expect(projectFileKind(path)).toBe(kind);
  });
  it("trova un file annidato e conserva le cartelle necessarie", () => {
    const files = [{ name: 'src', path: 'C:/panel/src', kind: 'directory' as const, children: [
      { name: 'Page.tsx', path: 'C:/panel/src/Page.tsx', kind: 'file' as const },
      { name: 'main.css', path: 'C:/panel/src/main.css', kind: 'file' as const },
    ] }];
    expect(filterProjectFiles(files, 'PAGE')[0].children?.map((entry) => entry.name)).toEqual(['Page.tsx']);
    expect(filterProjectFiles(files, 'src')).toEqual(files);
    expect(filterProjectFiles(files, 'missing')).toEqual([]);
    expect(filterProjectFiles(files, '')).toBe(files);
  });
  it("apre immagini solo dal progetto nel server locale, codificando i caratteri dei nomi", () => {
    const url = projectImageUrl('C:/panel', 'C:\\panel\\public\\foto #2.png', 'http://127.0.0.1:4173/settings?test=1#anchor')!;
    expect(new URL(url).pathname).toBe('/@fs/C:/panel/public/foto%20%232.png');
    expect(new URL(url).search).toBe(''); expect(new URL(url).hash).toBe('');
    for (const preview of ['https://example.com', 'file:///C:/panel', 'not a URL', undefined]) expect(projectImageUrl('C:/panel', 'C:/panel/image.png', preview)).toBeUndefined();
    expect(projectImageUrl('C:/panel', 'C:/other/image.png', 'http://localhost:4173')).toBeUndefined();
    expect(projectImageUrl('C:/panel', 'C:/panel/../other/image.png', 'http://localhost:4173')).toBeUndefined();
  });
});
