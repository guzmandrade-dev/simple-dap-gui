import { useState, useCallback } from 'react';
import { DebugProtocol } from '@vscode/debugprotocol';
import { useDebugStore } from '../../stores/debugStore';

function IconChevron({ className, direction }: { className?: string; direction: 'right' | 'down' }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: direction === 'down' ? 'rotate(90deg)' : undefined }}
    >
      <path d="M4 2l4 4-4 4" />
    </svg>
  );
}

export function VariablesPanel() {
  const { variables, currentFrameId, isSessionActive } = useDebugStore();

  const frameVariables = currentFrameId ? variables.get(currentFrameId) || [] : [];

  if (!isSessionActive) {
    return <div className="p-4 text-text-secondary text-sm">No active debug session</div>;
  }

  if (!currentFrameId) {
    return <div className="p-4 text-text-secondary text-sm">No frame selected</div>;
  }

  if (frameVariables.length === 0) {
    return <div className="p-4 text-text-secondary text-sm">No variables available</div>;
  }

  return (
    <div className="py-2">
      <h3 className="text-xs font-medium text-text-muted uppercase mb-1 px-3">Variables</h3>
      <div className="font-mono text-sm">
        {frameVariables.map((variable) => (
          <VariableTree key={variable.name} variable={variable} depth={0} />
        ))}
      </div>
    </div>
  );
}

interface VariableTreeProps {
  variable: DebugProtocol.Variable;
  depth: number;
}

function VariableTree({ variable, depth }: VariableTreeProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const { variables, fetchChildVariables } = useDebugStore();

  const hasChildren = variable.variablesReference > 0;
  const childVars = hasChildren ? variables.get(variable.variablesReference) : undefined;

  const handleToggle = useCallback(async () => {
    if (!hasChildren) return;

    if (!expanded && childVars === undefined) {
      setLoading(true);
      try {
        await fetchChildVariables(variable.variablesReference);
      } finally {
        setLoading(false);
      }
    }

    setExpanded(!expanded);
  }, [expanded, hasChildren, childVars, fetchChildVariables, variable.variablesReference]);

  return (
    <div style={{ marginLeft: depth * 12 }}>
      <div
        className="grid grid-cols-[auto_1fr] gap-x-1 items-start cursor-pointer px-3 py-0.5 hover:bg-bg-tertiary"
        onClick={handleToggle}
      >
        <div className="flex items-center gap-1 shrink-0">
          {hasChildren ? (
            <span className="text-text-muted w-4 text-center">
              {loading ? '•' : <IconChevron direction={expanded ? 'down' : 'right'} />}
            </span>
          ) : (
            <span className="w-4" />
          )}
          <span className="text-accent">{variable.name}</span>
          <span className="text-text-muted">=</span>
        </div>
        <span className={`${getValueColor(variable.type)} break-all`}>{variable.value}</span>
      </div>
      {expanded && hasChildren && childVars !== undefined && (
        <div>
          {childVars.map((child) => (
            <VariableTree key={child.name} variable={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function getValueColor(type?: string): string {
  const colors: Record<string, string> = {
    string: 'text-success',
    number: 'text-warning',
    boolean: 'text-accent',
    null: 'text-text-muted',
    undefined: 'text-text-muted',
    object: 'text-warning',
    array: 'text-warning',
  };
  return colors[type || ''] || 'text-text';
}
