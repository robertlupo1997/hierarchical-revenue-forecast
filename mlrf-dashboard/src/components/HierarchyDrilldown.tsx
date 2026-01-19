import { useState, useCallback, useMemo } from 'react';
import { ChevronRight, Home, Layers, Store, Package, Box, Search, X } from 'lucide-react';
import type { HierarchyNode } from '../lib/api';
import { cn, formatCurrency } from '../lib/utils';

interface HierarchyDrilldownProps {
  data: HierarchyNode;
  onSelect?: (node: HierarchyNode) => void;
}

const levelConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  total: { label: 'Total', color: 'bg-chart-3/15 text-chart-3 border-chart-3/30', icon: Layers },
  store: { label: 'Store', color: 'bg-chart-2/15 text-chart-2 border-chart-2/30', icon: Store },
  family: { label: 'Family', color: 'bg-primary/15 text-primary border-primary/30', icon: Package },
  bottom: { label: 'Item', color: 'bg-chart-4/15 text-chart-4 border-chart-4/30', icon: Box },
};

export function HierarchyDrilldown({ data, onSelect }: HierarchyDrilldownProps) {
  const [pathStack, setPathStack] = useState<HierarchyNode[]>([data]);
  const [searchQuery, setSearchQuery] = useState('');
  const currentNode = pathStack[pathStack.length - 1];

  // Filter children based on search query
  const filteredChildren = useMemo(() => {
    if (!currentNode.children) return [];
    if (!searchQuery.trim()) return currentNode.children;

    const query = searchQuery.toLowerCase();
    return currentNode.children.filter(child =>
      child.name.toLowerCase().includes(query) ||
      child.id.toLowerCase().includes(query)
    );
  }, [currentNode.children, searchQuery]);

  // Show search only at total level with many children (store level)
  const showSearch = currentNode.level === 'total' &&
    currentNode.children &&
    currentNode.children.length > 10;

  const handleDrillDown = useCallback(
    (node: HierarchyNode) => {
      setSearchQuery(''); // Clear search when drilling down
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
      setSearchQuery(''); // Clear search when navigating
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

  const config = levelConfig[currentNode.level] || levelConfig.total;
  const LevelIcon = config.icon;

  return (
    <div className="space-y-5">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-1 text-sm overflow-x-auto scrollbar-hide pb-1">
        {pathStack.map((node, index) => {
          const nodeConfig = levelConfig[node.level] || levelConfig.total;
          return (
            <span key={node.id} className="flex items-center shrink-0">
              {index > 0 && (
                <ChevronRight className="mx-1.5 h-4 w-4 text-muted-foreground/50" />
              )}
              <button
                onClick={() => handleNavigate(index)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 transition-all duration-200',
                  'hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  index === pathStack.length - 1
                    ? 'font-semibold text-foreground bg-secondary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {index === 0 ? (
                  <span className="flex items-center gap-1.5">
                    <Home className="h-3.5 w-3.5" />
                    {node.name}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <nodeConfig.icon className="h-3.5 w-3.5" />
                    {node.name}
                  </span>
                )}
              </button>
            </span>
          );
        })}
      </nav>

      {/* Current Level Summary */}
      <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-4 sm:p-5 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className={cn(
              'flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl border shrink-0',
              config.color
            )}>
              <LevelIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground truncate">
                {currentNode.name}
              </h3>
              <span
                className={cn(
                  'mt-1 sm:mt-1.5 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
                  config.color
                )}
              >
                {config.label}
              </span>
            </div>
          </div>
          <div className="text-left sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
              {formatCurrency(currentNode.prediction)}
            </div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">Predicted Revenue</div>
            {currentNode.actual !== undefined && (
              <div className="mt-2 text-sm">
                <span className="text-muted-foreground">Actual: </span>
                <span className="font-medium font-mono text-foreground">
                  {formatCurrency(currentNode.actual)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Store Search */}
      {showSearch && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search stores..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                'w-full rounded-lg border border-border bg-card pl-10 pr-10 py-2 sm:py-2.5 text-sm',
                'placeholder:text-muted-foreground/70',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                'transition-all duration-200'
              )}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors touch-manipulation"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
            {searchQuery ? (
              <span>
                {filteredChildren.length} of {currentNode.children?.length ?? 0} stores
              </span>
            ) : (
              <span>{currentNode.children?.length ?? 0} stores</span>
            )}
          </div>
        </div>
      )}

      {/* Children Grid */}
      {filteredChildren.length > 0 && (
        <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredChildren.map((child, index) => {
            const childConfig = levelConfig[child.level] || levelConfig.total;
            const ChildIcon = childConfig.icon;
            const hasChildren = child.children && child.children.length > 0;

            return (
              <button
                key={child.id}
                onClick={() => handleDrillDown(child)}
                className={cn(
                  'group relative rounded-xl border border-border bg-card p-4 text-left',
                  'transition-all duration-200 ease-out animate-fade-in-up',
                  'hover:border-primary/40 hover:shadow-card-hover hover:bg-card/80',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  hasChildren ? 'cursor-pointer' : 'cursor-default'
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Percentage badge */}
                <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground shadow-glow">
                    {formatPercentage(child)}
                  </span>
                </div>

                <div className="flex items-start gap-3">
                  <div className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-transform group-hover:scale-110',
                    childConfig.color
                  )}>
                    <ChildIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium text-foreground group-hover:text-primary transition-colors">
                      {child.name}
                    </div>
                    <span
                      className={cn(
                        'mt-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border',
                        childConfig.color
                      )}
                    >
                      {childConfig.label}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <div className="text-lg font-semibold text-foreground font-mono">
                    {formatCurrency(child.prediction)}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">
                    {formatPercentage(child)}
                  </div>
                </div>

                {hasChildren && (
                  <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{child.children!.length} items</span>
                    <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* No Search Results */}
      {searchQuery && filteredChildren.length === 0 && currentNode.children && currentNode.children.length > 0 && (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center bg-muted/20">
          <div className="flex justify-center mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <p className="text-muted-foreground font-medium">
            No stores match "{searchQuery}"
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Try a different search term
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Empty State - Lowest Level */}
      {(!currentNode.children || currentNode.children.length === 0) && (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center bg-muted/20">
          <div className="flex justify-center mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Box className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <p className="text-muted-foreground font-medium">
            This is the lowest level in the hierarchy
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            No further drill-down available
          </p>
        </div>
      )}
    </div>
  );
}
