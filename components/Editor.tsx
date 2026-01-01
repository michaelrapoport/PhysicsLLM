import React from 'react';

interface EditorProps {
  code: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

const Editor: React.FC<EditorProps> = ({ code, onChange, readOnly }) => {
  return (
    <div className="relative w-full h-full font-mono text-sm group">
      <div className="absolute top-0 left-0 right-0 bg-brand-code text-gray-400 text-xs px-4 py-1 border-b border-gray-700 flex justify-between items-center">
        <span>script.js</span>
        <span className="text-xs opacity-50">PhysLLM v1.0</span>
      </div>
      <textarea
        value={code}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        className="w-full h-full pt-8 p-4 bg-brand-code text-green-400 resize-none focus:outline-none focus:ring-1 focus:ring-brand-blue"
        style={{
            lineHeight: '1.5',
            fontFamily: '"Fira Code", monospace'
        }}
      />
    </div>
  );
};

export default Editor;