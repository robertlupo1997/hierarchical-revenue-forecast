import { useState, useCallback } from 'react';
import { ChevronRight, Home } from 'lucide-react';
import type { HierarchyNode } from '../lib/api';
import { cn, formatCurrency } from '../lib/utils';

interface HierarchyDrilldownProps {
  data: HierarchyNode;
  onSelect?: (node: HierarchyNode) => void;
}

const levelColors: Record<string, string> = {
  total: 'bg-purple-100 text-purple-800',
  store: 'bg-blue-100 text-blue-800',
  family: 'bg-green-100 text-green-800',
  bottom: 'bg-orange-100 text-orange-800',
};

const levelLabels: Record<string, string> = {
  total: 'Total',
  store: 'Store',
  family: 'Family',
  bottom: 'Item',
};

export function HierarchyDrilldown({ data, onSelect }: HierarchyDrilldownProps) {
  const [pathStack, setPathStack] = useState<HierarchyNode[]>([data]);
  const currentNode = pathStack[pathStack.length - 1];

  const handleDrillDown = useCallback(
    (node: HierarchyNode) => {
      if (node.children && node.children.length > 0) {
        setPathStack((prev) => [...prev, node]);
        onSelect?.(node);
      } else {
        onSelect?.(node);
      }
    },
    [onSelect]
  );

  const handleNavigate = useCallback(
    (index: number) => {
      setPathStack((prev) => prev.slice(0, index + 1));
      onSelect?.(pathStack[index]);
    },
    [pathStack, onSelect]
  );

  const formatPercentage = (child: HierarchyNode) => {
    if (!currentNode.prediction || currentNode.prediction === 0) return '';
    const pct = (child.prediction / currentNode.prediction) * 100;
    return `${pct.toFixed(1)}%`;
  };

  return (
    <div className="space-y-4">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center space-x-1 text-sm">
        {pathStack.map((node, index) => (
          <span key={node.id} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="mx-1 h-4 w-4 text-gray-400" />
            )}
            <button
              onClick={() => handleNavigate(index)}
              className={cn(
                'rounded px-2 py-1 transition-colors hover:bg-gray-100',
                index === pathStack.length - 1
                  ? 'font-semibold text-gray-900'
                  : 'text-gray-600'
              )}
            >
              {index === 0 ? (
                <span className="flex items-center gap-1">
                  <Home className="h-3 w-3" />
                  {node.name}
                </span>
              ) : (
                node.name
              )}
            </button>
          </span>
        ))}
      </nav>

      {/* Current Level Summary */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{currentNode.name}</h3>
            <span
              className={cn(
                'mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium',
                levelColors[currentNode.level]
              )}
            >
              {levelLabels[currentNode.level]}
            </span>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(currentNode.prediction)}
            </div>
            <div className="text-sm text-gray-500">Predicted Revenue</div>
            {currentNode.actual !== undefined && (
              <div className="mt-1 text-sm">
                <span className="text-gray-500">Actual: </span>
                <span className="font-medium">
                  {formatCurrency(currentNode.actual)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Children Grid */}
      {currentNode.children && currentNode.children.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {currentNode.children.map((child) => (
            <button
              key={child.id}
              onClick={() => handleDrillDown(child)}
              className={cn(
                'group rounded-lg border bg-white p-4 text-left shadow-sm transition',
                'hover:border-blue-300 hover:shadow-md',
                child.children && child.children.length > 0
                  ? 'cursor-pointer'
                  : 'cursor-default'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 truncate">
                  <div className="truncate font-medium text-gray-900">
                    {child.name}
                  </div>
                  <span
                    className={cn(
                      'mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium',
                      levelColors[child.level]
                    )}
                  >
                    {levelLabels[child.level]}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-500">
                    {formatPercentage(child)}
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <div className="text-lg font-semibold text-gray-900">
                  {formatCurrency(child.prediction)}
                </div>
              </div>

              {child.children && child.children.length > 0 && (
                <div className="mt-2 flex items-center text-xs text-gray-500">
                  <span>{child.children.length} items</span>
                  <ChevronRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Empty State */}
      {(!currentNode.children || currentNode.children.length === 0) && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-gray-500">
            This is the lowest level in the hierarchy.
          </p>
        </div>
      )}
    </div>
  );
}
