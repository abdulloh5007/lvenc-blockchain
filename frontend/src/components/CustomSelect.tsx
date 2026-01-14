import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './CustomSelect.css';

interface Option {
    value: string;
    label: string;
}

interface CustomSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Select...',
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    return (
        <div className={`custom-select ${className}`} ref={containerRef}>
            <button
                type="button"
                className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="custom-select-value">
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown size={16} className={`custom-select-arrow ${isOpen ? 'rotated' : ''}`} />
            </button>

            <div className={`custom-select-dropdown ${isOpen ? 'open' : ''}`}>
                {options.map(option => (
                    <button
                        key={option.value}
                        type="button"
                        className={`custom-select-option ${option.value === value ? 'selected' : ''}`}
                        onClick={() => handleSelect(option.value)}
                    >
                        <span>{option.label}</span>
                        {option.value === value && <Check size={14} />}
                    </button>
                ))}
            </div>
        </div>
    );
};
