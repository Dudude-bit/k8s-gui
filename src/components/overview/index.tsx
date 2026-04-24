import { Link } from "react-router-dom";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MetricBadge } from "@/components/ui/metric-card";

// Shared types

export type StatBadgeVariant =
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "success"
    | "warning"
    | "error";

export type StatBadgeConfig = {
    label: string;
    value: number;
    variant?: StatBadgeVariant;
    icon?: React.ElementType;
    hideWhenZero?: boolean;
};

export type ResourceStatCardData = {
    id: string;
    title: string;
    icon: React.ElementType;
    value: number;
    badges?: StatBadgeConfig[];
    description?: string;
    href?: string;
};

export type TopPodMetric = {
    name: string;
    namespace: string;
    value: number;
};

export type QuickActionTileProps = {
    icon: React.ElementType;
    label: string;
    description: string;
    href?: string;
    onClick?: () => void;
};

// Components

import { cn } from "@/lib/utils";

export type OverviewHeaderProps = {
    title: string;
    subtitle: string;
};

export function OverviewHeader({ title, subtitle }: OverviewHeaderProps) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
        </div>
    );
}

export function ResourceStatCard({
    title,
    icon: Icon,
    value,
    badges,
    description,
    href,
}: ResourceStatCardData) {
    const visibleBadges =
        badges?.filter((badge) => !badge.hideWhenZero || badge.value > 0) ?? [];

    const card = (
        <Card
            className={cn(
                "transition-all duration-200",
                href && "group-hover:bg-accent"
            )}
        >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-2">
                <div className="text-2xl font-bold">{value}</div>
                {visibleBadges.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs">
                        {visibleBadges.map((badge) => {
                            const BadgeIcon = badge.icon;
                            return (
                                <Badge
                                    key={badge.label}
                                    variant={badge.variant ?? "secondary"}
                                    className="gap-1"
                                >
                                    {BadgeIcon && <BadgeIcon className="h-3 w-3" />}
                                    {badge.value} {badge.label}
                                </Badge>
                            );
                        })}
                    </div>
                )}
                {description && (
                    <p className="text-xs text-muted-foreground">{description}</p>
                )}
            </CardContent>
        </Card>
    );

    if (!href) {
        return card;
    }

    return (
        <Link
            to={href}
            className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open ${title}`}
        >
            {card}
        </Link>
    );
}

export type TopPodsCardProps = {
    title: string;
    description: string;
    items: TopPodMetric[];
    type: "cpu" | "memory";
    basePath: string;
};

export function TopPodsCard({
    title,
    description,
    items,
    type,
    basePath,
}: TopPodsCardProps) {
    const maxValue = items.reduce((max, item) => Math.max(max, item.value), 0);

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                {items.length > 0 ? (
                    <div className="space-y-2">
                        {items.map((item, idx) => {
                            const progress = maxValue
                                ? Math.min(100, (item.value / maxValue) * 100)
                                : 0;
                            return (
                                <Link
                                    key={`${item.namespace}-${item.name}`}
                                    to={`${basePath}/${item.namespace}/${item.name}`}
                                    className="flex cursor-pointer flex-col gap-2 rounded-md border border-transparent p-2 transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    aria-label={`Open pod ${item.namespace}/${item.name}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <Badge
                                                    variant="outline"
                                                    className="px-2 text-[10px] font-medium"
                                                >
                                                    #{idx + 1}
                                                </Badge>
                                                <span className="truncate text-sm font-medium">
                                                    {item.name}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {item.namespace}
                                            </p>
                                        </div>
                                        <MetricBadge
                                            used={item.value}
                                            type={type}
                                            className="shrink-0"
                                        />
                                    </div>
                                    <Progress value={progress} className="h-1" />
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        No pod metrics available
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function QuickActionTile({
    icon: Icon,
    label,
    description,
    href,
    onClick,
}: QuickActionTileProps) {
    const content = (
        <>
            <div className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground transition-colors group-hover:text-foreground">
                <Icon className="h-4 w-4" />
            </div>
            <div className="space-y-1 text-left">
                <p className="text-sm font-medium leading-none">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>
        </>
    );

    const className = cn(
        "group flex items-start gap-3 rounded-lg border border-border bg-card p-3",
        "transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    );

    if (href) {
        return (
            <Link to={href} className={className} aria-label={label}>
                {content}
            </Link>
        );
    }

    return (
        <button
            type="button"
            className={className}
            onClick={onClick}
            aria-label={label}
        >
            {content}
        </button>
    );
}
