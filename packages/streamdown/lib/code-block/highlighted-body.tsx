import {
  type HTMLAttributes,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { StreamdownContext } from "../../index";
import { useCodePlugin } from "../plugin-context";
import type {
  BundledLanguage,
  CodeHighlighterPlugin,
  HighlightResult,
  ThemeInput,
} from "../plugin-types";
import { CodeBlockBody } from "./body";

// Server and hydration renders get false, so they render what the server did
const subscribeToNothing = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

interface HighlightInputs {
  code: string;
  codePlugin: CodeHighlighterPlugin | null;
  isClientRender: boolean;
  isIncomplete: boolean;
  language: string;
  shikiTheme: [ThemeInput, ThemeInput];
}

const sameInputs = (a: HighlightInputs, b: HighlightInputs): boolean =>
  a.code === b.code &&
  a.codePlugin === b.codePlugin &&
  a.isClientRender === b.isClientRender &&
  a.isIncomplete === b.isIncomplete &&
  a.language === b.language &&
  a.shikiTheme === b.shikiTheme;

type HighlightedCodeBlockBodyProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  isIncomplete?: boolean;
  language: string;
  maxHeight?: number | string;
  raw: HighlightResult;
  startLine?: number;
  lineNumbers?: boolean;
};

export const HighlightedCodeBlockBody = ({
  code,
  isIncomplete = false,
  language,
  maxHeight,
  raw,
  className,
  startLine,
  lineNumbers,
  ...rest
}: HighlightedCodeBlockBodyProps) => {
  const { shikiTheme } = useContext(StreamdownContext);
  const codePlugin = useCodePlugin();
  const isClientRender = useSyncExternalStore(
    subscribeToNothing,
    getClientSnapshot,
    getServerSnapshot
  );
  const inputs: HighlightInputs = {
    code,
    codePlugin,
    isClientRender,
    isIncomplete,
    language,
    shikiTheme,
  };

  // What the block can show before its highlight request: the plain tokens
  // without a plugin, or a result the plugin already has
  const peek = (): HighlightResult | null => {
    if (!codePlugin) {
      return raw;
    }
    if (!isClientRender) {
      return null;
    }
    return (
      codePlugin.getCachedResult?.({
        code,
        isIncomplete,
        language: language as BundledLanguage,
        themes: shikiTheme,
      }) ?? null
    );
  };

  // Seeded once per set of inputs, while rendering, so code the plugin has
  // already highlighted is not committed plain. Any later result from the
  // highlight callback replaces it.
  const [result, setResult] = useState<HighlightResult>(() => peek() ?? raw);
  const [seededInputs, setSeededInputs] = useState(inputs);
  if (!sameInputs(seededInputs, inputs)) {
    setSeededInputs(inputs);
    const seed = peek();
    if (seed) {
      setResult(seed);
    }
  }

  useEffect(() => {
    if (!codePlugin) {
      setResult(raw);
      return;
    }

    // Ignore results for code this block has already moved past
    let current = true;
    const cachedResult = codePlugin.highlight(
      {
        code,
        isIncomplete,
        language: language as BundledLanguage,
        themes: shikiTheme,
      },
      (highlightedResult) => {
        if (current) {
          setResult(highlightedResult);
        }
      }
    );

    if (cachedResult) {
      setResult(cachedResult);
    }
    return () => {
      current = false;
    };
  }, [code, isIncomplete, language, shikiTheme, codePlugin, raw]);

  return (
    <CodeBlockBody
      className={className}
      language={language}
      lineNumbers={lineNumbers}
      maxHeight={maxHeight}
      result={result}
      startLine={startLine}
      {...rest}
    />
  );
};
