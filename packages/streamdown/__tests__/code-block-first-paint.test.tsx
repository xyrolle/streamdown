import { type ReactElement, useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamdownContext, type StreamdownContextType } from "../index";
import { HighlightedCodeBlockBody } from "../lib/code-block/highlighted-body";
import { PluginContext } from "../lib/plugin-context";
import type {
  CodeHighlighterPlugin,
  HighlightOptions,
  HighlightResult,
} from "../lib/plugin-types";

const context: StreamdownContextType = {
  codeBlockMaxHeight: 400,
  controls: true,
  isAnimating: false,
  lineNumbers: true,
  mode: "streaming",
  shikiTheme: ["github-light", "github-dark"],
  tableMaxHeight: 300,
};

const resultFor = (code: string, color: string): HighlightResult => ({
  bg: "transparent",
  fg: "inherit",
  tokens: [
    [
      {
        content: code,
        color,
        bgColor: "transparent",
        htmlStyle: {},
        offset: 0,
      },
    ],
  ],
});

const basePlugin = {
  name: "shiki",
  type: "code-highlighter",
  getSupportedLanguages: () => ["javascript"],
  getThemes: () => ["github-light", "github-dark"],
  supportsLanguage: () => true,
} satisfies Omit<CodeHighlighterPlugin, "highlight">;

// Like `@streamdown/code` for a block it has highlighted before
const createCachedPlugin = (): CodeHighlighterPlugin => ({
  ...basePlugin,
  getCachedResult: ({ code }: HighlightOptions) => resultFor(code, "#ff0000"),
  highlight: ({ code }: HighlightOptions) => resultFor(code, "#ff0000"),
});

const body = (code: string, plugin: CodeHighlighterPlugin | null) => (
  <PluginContext.Provider value={plugin ? { code: plugin } : null}>
    <StreamdownContext.Provider value={context}>
      <HighlightedCodeBlockBody
        code={code}
        language="javascript"
        raw={resultFor(code, "inherit")}
      />
    </StreamdownContext.Provider>
  </PluginContext.Provider>
);

// `act` flushes every pending update, so it cannot tell a result applied in
// the commit from one applied by a later render. `flushSync` commits the way
// a click does and returns before updates made in passive effects are
// rendered, which React does in a later task.
describe("HighlightedCodeBlockBody first commit", () => {
  let container: HTMLDivElement;
  let root: Root;
  let previousActEnvironment: boolean | undefined;

  const commit = (element: ReactElement) => {
    flushSync(() => {
      root.render(element);
    });
  };

  const token = () =>
    container.querySelector(
      '[data-streamdown="code-block-body"] code > span > span'
    ) as HTMLElement;

  beforeEach(() => {
    previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  it("applies a cached highlight result in the mounting commit", () => {
    commit(body("const a = 1;", createCachedPlugin()));

    expect(token().textContent).toBe("const a = 1;");
    expect(token().style.getPropertyValue("--sdm-c")).toBe("#ff0000");
  });

  it("applies the cached result for new code in the same commit", () => {
    const plugin = createCachedPlugin();
    commit(body("const a = 1;", plugin));
    commit(body("const b = 2;", plugin));

    expect(token().textContent).toBe("const b = 2;");
    expect(token().style.getPropertyValue("--sdm-c")).toBe("#ff0000");
  });

  it("shows new code in the same commit without a code plugin", () => {
    commit(body("const a = 1;", null));
    commit(body("const b = 2;", null));

    expect(token().textContent).toBe("const b = 2;");
  });

  it("leaves a cache miss to the highlight callback", () => {
    const callbacks: ((result: HighlightResult) => void)[] = [];
    const highlight = vi.fn(
      (_: HighlightOptions, callback?: (result: HighlightResult) => void) => {
        if (callback) {
          callbacks.push(callback);
        }
        return null;
      }
    );
    commit(
      body("const a = 1;", {
        ...basePlugin,
        getCachedResult: () => null,
        highlight,
      })
    );

    expect(token().style.getPropertyValue("--sdm-c")).toBe("inherit");
    expect(highlight).toHaveBeenCalledTimes(1);

    flushSync(() => {
      callbacks[0](resultFor("const a = 1;", "#00ff00"));
    });
    expect(token().style.getPropertyValue("--sdm-c")).toBe("#00ff00");
  });

  it("shows a highlight result that arrives after the cached one", () => {
    // A plugin whose cache is cleared between the render and the request
    const cache = new Map([
      ["const a = 1;", resultFor("const a = 1;", "#ff0000")],
    ]);
    let deliver: ((result: HighlightResult) => void) | undefined;
    const plugin: CodeHighlighterPlugin = {
      ...basePlugin,
      getCachedResult: ({ code }: HighlightOptions) => cache.get(code) ?? null,
      highlight: (
        { code }: HighlightOptions,
        callback?: (result: HighlightResult) => void
      ) => {
        deliver = callback;
        return cache.get(code) ?? null;
      },
    };
    const ClearCache = () => {
      useLayoutEffect(() => {
        cache.clear();
      }, []);
      return null;
    };

    commit(
      <PluginContext.Provider value={{ code: plugin }}>
        <StreamdownContext.Provider value={context}>
          <HighlightedCodeBlockBody
            code="const a = 1;"
            language="javascript"
            raw={resultFor("const a = 1;", "inherit")}
          />
          <ClearCache />
        </StreamdownContext.Provider>
      </PluginContext.Provider>
    );
    expect(token().style.getPropertyValue("--sdm-c")).toBe("#ff0000");

    flushSync(() => {
      deliver?.(resultFor("const a = 1;", "#0000ff"));
    });
    expect(token().style.getPropertyValue("--sdm-c")).toBe("#0000ff");
  });

  it("still applies a result returned by highlight when the plugin cannot be read before paint", async () => {
    commit(
      body("const a = 1;", {
        ...basePlugin,
        highlight: ({ code }: HighlightOptions) => resultFor(code, "#ff0000"),
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(token().style.getPropertyValue("--sdm-c")).toBe("#ff0000");
  });
});

describe("HighlightedCodeBlockBody highlight requests", () => {
  let container: HTMLDivElement;
  let root: Root | undefined;
  let previousActEnvironment: boolean | undefined;

  beforeEach(() => {
    previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    root?.unmount();
    root = undefined;
    container.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  it("does not move a sibling's highlight request ahead of the commit", async () => {
    const log: string[] = [];
    const plugin: CodeHighlighterPlugin = {
      ...basePlugin,
      getCachedResult: ({ code }: HighlightOptions) =>
        code === "cached" ? resultFor(code, "#ff0000") : null,
      highlight: ({ code }: HighlightOptions) => {
        if (code === "cached") {
          return resultFor(code, "#ff0000");
        }
        log.push("miss requested");
        return null;
      },
    };
    const CommitMarker = () => {
      useLayoutEffect(() => {
        log.push("committed");
        queueMicrotask(() => log.push("commit task ended"));
      }, []);
      return null;
    };
    root = createRoot(container);
    root.render(
      <PluginContext.Provider value={{ code: plugin }}>
        <StreamdownContext.Provider value={context}>
          <HighlightedCodeBlockBody
            code="cached"
            language="javascript"
            raw={resultFor("cached", "inherit")}
          />
          <HighlightedCodeBlockBody
            code="missed"
            language="javascript"
            raw={resultFor("missed", "inherit")}
          />
          <CommitMarker />
        </StreamdownContext.Provider>
      </PluginContext.Provider>
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(log).toEqual(["committed", "commit task ended", "miss requested"]);
  });

  it("hydrates server HTML without a mismatch when the client has the result cached", async () => {
    // The server never highlighted this block; the client already has it
    const serverPlugin: CodeHighlighterPlugin = {
      ...basePlugin,
      getCachedResult: () => null,
      highlight: () => null,
    };
    container.innerHTML = renderToString(body("const a = 1;", serverPlugin));
    const recoverableErrors: unknown[] = [];

    root = hydrateRoot(container, body("const a = 1;", createCachedPlugin()), {
      onRecoverableError: (error) => recoverableErrors.push(error),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(recoverableErrors).toEqual([]);
    expect(
      (
        container.querySelector(
          '[data-streamdown="code-block-body"] code > span > span'
        ) as HTMLElement
      ).style.getPropertyValue("--sdm-c")
    ).toBe("#ff0000");
  });
});

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
