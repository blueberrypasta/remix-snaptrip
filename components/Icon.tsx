import React, { type SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: string;
}

export const Icon: React.FC<IconProps> = ({
  name,
  className = '',
  'aria-hidden': ariaHidden = true,
  focusable = false,
  ...props
}) => {
  const validName = /^[a-z0-9_]+$/.test(name) ? name : 'help';
  const baseClasses = 'inline-block w-[1em] h-[1em] shrink-0 fill-current align-middle';
  const combinedClassName = className ? `${baseClasses} ${className}` : baseClasses;

  return (
    <svg
      viewBox="0 -960 960 960"
      aria-hidden={ariaHidden}
      focusable={focusable}
      className={combinedClassName}
      {...props}
    >
      <use href={`/icons.svg#${validName}`} />
    </svg>
  );
};

export default Icon;
