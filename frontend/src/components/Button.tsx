import React from 'react';
import './Button.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    icon?: string;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    disabled,
    className = '',
    ...props
}) => {
    return (
        <button
            className={`btn btn-${variant} btn-${size} ${loading ? 'loading' : ''} ${className}`}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <span className="btn-spinner"></span>}
            {icon && !loading && <span className="btn-icon">{icon}</span>}
            {children}
        </button>
    );
};
