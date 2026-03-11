import * as React from "react";

export const TableIcon = React.memo(
  ({ className, ...props }: React.SVGProps<SVGSVGElement>) => {
    return (
      <svg
        width="24"
        height="24"
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path
          d="M5 4.75H19C19.6904 4.75 20.25 5.30964 20.25 6V18C20.25 18.6904 19.6904 19.25 19 19.25H5C4.30964 19.25 3.75 18.6904 3.75 18V6C3.75 5.30964 4.30964 4.75 5 4.75Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M4 9H20"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M4 14.5H20"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M9.5 5V19"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M14.5 5V19"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  },
);

TableIcon.displayName = "TableIcon";
