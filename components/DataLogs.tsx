import React, { useEffect, useRef } from 'react';

interface DataLogsProps {
  logs: string[];
}

const DataLogs: React.FC<DataLogsProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="w-full h-full bg-gray-900 text-gray-200 font-mono text-xs p-4 overflow-y-auto">
      <div className="text-gray-500 mb-2 border-b border-gray-700 pb-1">
        // OUTPUT STREAM (JSON/Text)
      </div>
      {logs.length === 0 && <span className="text-gray-600 italic">Waiting for simulation events...</span>}
      {logs.map((log, i) => (
        <div key={i} className="mb-1 whitespace-pre-wrap">
          <span className="text-blue-400">{'>'}</span> {log}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
};

export default DataLogs;