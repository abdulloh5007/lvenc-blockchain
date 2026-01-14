import React from 'react';
import './Input.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, icon, className = '', ...props }) => {
    return (
        <div className={`input-wrapper ${error ? 'has-error' : ''} ${className}`}>
            {label && <label className="input-label">{label}</label>}
            <div className="input-container">
                {icon && <span className="input-icon">{icon}</span>}
                <input className={`input ${icon ? 'has-icon' : ''}`} {...props} />
            </div>
            {error && <span className="input-error">{error}</span>}
        </div>
    );
};

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
}

export const Textarea: React.FC<TextareaProps> = ({ label, error, className = '', ...props }) => {
    return (
        <div className={`input-wrapper ${error ? 'has-error' : ''} ${className}`}>
            {label && <label className="input-label">{label}</label>}
            <textarea className="textarea" {...props} />
            {error && <span className="input-error">{error}</span>}
        </div>
    );
};
