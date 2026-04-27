import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { yaml as yamlLanguage } from "@codemirror/lang-yaml";
import { EditorView } from "@codemirror/view";
import { useThemeStore } from "@/stores/themeStore";

export interface YamlEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string;
  className?: string;
  showLineNumbers?: boolean;
  showFoldGutter?: boolean;
}

export function YamlEditor({
  value,
  onChange,
  readOnly = false,
  height = "100%",
  className,
  showLineNumbers = true,
  showFoldGutter = true,
}: YamlEditorProps) {
  const theme = useThemeStore((state) => state.theme);

  const editorTheme = useMemo(() => {
    return theme === "dark" ? "dark" : "light";
  }, [theme]);

  const extensions = useMemo(() => {
    return [yamlLanguage(), EditorView.lineWrapping];
  }, []);

  return (
    <CodeMirror
      value={value}
      height={height}
      theme={editorTheme}
      extensions={extensions}
      onChange={readOnly ? undefined : onChange}
      editable={!readOnly}
      className={className}
      basicSetup={{
        lineNumbers: showLineNumbers,
        highlightActiveLineGutter: !readOnly,
        highlightActiveLine: !readOnly,
        foldGutter: showFoldGutter,
        autocompletion: !readOnly,
        bracketMatching: true,
        indentOnInput: !readOnly,
      }}
    />
  );
}
