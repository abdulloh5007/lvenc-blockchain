import React from 'react';
import './Card.css';

interface CardProps {
    title?: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ title, icon, children, className = '', action }) => {
    return (
        <div className={`card ${className}`}>
            {(title || action) && (
                <div className="card-header">
                    <div className="card-title">
                        {icon && <span className="card-icon">{icon}</span>}
                        {title && <h3>{title}</h3>}
                    </div>
                    {action && <div className="card-action">{action}</div>}
                </div>
            )}
            <div className="card-content">{children}</div>
        </div>
    );
};

interface StatCardProps {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    trend?: 'up' | 'down' | 'neutral';
    change?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, trend, change }) => {
    return (
        <div className="stat-card">
            <div className="stat-icon">{icon}</div>
            <div className="stat-info">
                <span className="stat-value">{value}</span>
                <span className="stat-label">{label}</span>
                {change && (
                    <span className={`stat-change ${trend}`}>
                        {trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''} {change}
                    </span>
                )}
            </div>
        </div>
    );
};
