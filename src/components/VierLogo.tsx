import React from 'react';

interface Props {
  className?: string;
  size?: number;
  alt?: string;
}

export const VierLogo: React.FC<Props> = ({ 
  className = "h-9 w-auto", 
  size,
  alt = "Vier Pet Care Logo" 
}) => {
  return (
    <div 
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`} 
      style={size ? { width: size, height: size } : undefined}
      title={alt}
    >
      <svg
        viewBox="0 0 580 230"
        className="w-full h-full max-h-full max-w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Stethoscope Group (Green) */}
        <g id="stethoscope" stroke="#429e37" strokeLinecap="round" strokeLinejoin="round">
          {/* Ear tips */}
          <ellipse cx="28" cy="74" rx="8" ry="5.5" transform="rotate(-30 28 74)" fill="#429e37" stroke="none" />
          <ellipse cx="88" cy="38" rx="8" ry="5.5" transform="rotate(35 88 38)" fill="#429e37" stroke="none" />

          {/* Binaural tubes on left */}
          <path d="M 32 78 C 42 98, 54 116, 64 126" strokeWidth="8.5" fill="none" />
          <path d="M 84 44 C 74 65, 66 95, 64 126" strokeWidth="8.5" fill="none" />

          {/* Central connector collar */}
          <rect x="58" y="122" width="12" height="15" rx="3.5" fill="#429e37" stroke="none" />

          {/* Main flexible green tube cradling the logo underneath */}
          <path 
            d="M 64 135 C 60 178, 98 214, 168 223 C 240 231, 355 231, 424 220 C 484 210, 524 172, 532 136 L 533 124" 
            strokeWidth="9.5" 
            fill="none" 
          />

          {/* Right connector */}
          <rect x="530" y="116" width="9" height="13" rx="2.5" fill="#429e37" stroke="none" />

          {/* Chestpiece: outer diaphragm ring & center bell */}
          <circle cx="558" cy="122" r="19" strokeWidth="7.5" fill="none" />
          <circle cx="558" cy="122" r="8.5" fill="#429e37" stroke="none" />
        </g>

        {/* 1. Letter 'v' Mascot - Orange Cat */}
        <g id="mascot-cat-v">
          {/* Cat Silhouette with ears */}
          <path 
            d="M 194 160 C 158 160, 140 135, 140 98 C 140 76, 144 54, 154 32 C 156 28, 161 29, 166 36 C 174 48, 184 56, 195 56 C 206 56, 215 48, 224 36 C 228 29, 233 28, 235 32 C 245 54, 250 76, 250 98 C 250 135, 232 160, 194 160 Z" 
            fill="#f78921" 
          />
          {/* Letter 'v' in white cartoon bubble font */}
          <path 
            d="M 172 65 C 168 59, 157 65, 162 74 L 186 128 C 190 136, 199 136, 203 128 L 227 74 C 231 65, 221 59, 216 65 L 194 116 L 172 65 Z" 
            fill="#ffffff" 
          />
        </g>

        {/* 2. Letter 'i' Mascot - Lime Bird */}
        <g id="mascot-bird-i">
          {/* Bird Silhouette with beak and crest */}
          <path 
            d="M 284 18 C 269 18, 259 28, 258 38 C 253 40, 246 42, 241 45 C 238 46, 239 50, 242 51 C 248 52, 255 53, 258 57 C 253 78, 250 115, 258 140 C 265 156, 278 160, 294 160 C 309 160, 320 146, 320 116 C 320 74, 311 38, 305 28 C 298 21, 291 18, 284 18 Z" 
            fill="#98cc28" 
          />
          {/* Bird Eye / Top Dot of 'i' */}
          <circle cx="284" cy="45" r="14.5" fill="#ffffff" />
          <circle cx="284" cy="45" r="6" fill="#98cc28" />
          {/* Stem of 'i' */}
          <rect x="273" y="73" width="22" height="67" rx="11" fill="#ffffff" />
        </g>

        {/* 3. Letter 'e' Mascot - Dusty Coral Paw / Rooster */}
        <g id="mascot-paw-e">
          {/* 3-lobed crest silhouette */}
          <path 
            d="M 320 58 C 316 48, 321 34, 332 34 C 340 34, 346 41, 348 47 C 352 35, 359 26, 370 26 C 381 26, 387 35, 389 47 C 392 40, 399 34, 407 37 C 417 39, 419 50, 417 62 C 414 88, 416 118, 410 140 C 403 158, 386 160, 368 160 C 350 160, 333 158, 326 140 C 318 118, 318 88, 320 58 Z" 
            fill="#d27575" 
          />
          {/* Letter 'e' in white bubble style */}
          <path 
            d="M 390 106 C 388 84, 373 70, 353 70 C 331 70, 317 88, 317 112 C 317 136, 333 152, 357 152 C 374 152, 386 142, 390 128 L 372 124 C 370 131, 365 136, 356 136 C 345 136, 337 126, 337 114 L 390 114 C 390 112, 390 109, 390 106 Z M 337 101 C 339 91, 345 85, 354 85 C 363 85, 370 91, 371 101 L 337 101 Z" 
            fill="#ffffff" 
            transform="translate(14, -1)" 
          />
        </g>

        {/* 4. Letter 'r' Mascot - Teal Blue Dog */}
        <g id="mascot-dog-r">
          {/* Dog head silhouette facing right with pointy ears and snout */}
          <path 
            d="M 406 66 C 404 48, 410 21, 421 17 C 427 15, 434 24, 437 38 C 442 27, 449 15, 460 15 C 467 15, 472 25, 473 38 C 485 46, 504 54, 523 64 C 529 67, 529 74, 522 78 C 512 82, 504 86, 499 94 C 491 110, 490 138, 481 153 C 473 160, 455 160, 434 160 C 416 160, 404 151, 399 133 C 395 112, 401 87, 406 66 Z" 
            fill="#54b2c9" 
          />
          {/* Letter 'r' in white cartoon bubble font */}
          <rect x="424" y="72" width="21" height="69" rx="10.5" fill="#ffffff" />
          <path 
            d="M 436 90 C 439 74, 455 68, 471 72 C 482 75, 486 86, 480 97 C 474 105, 464 105, 458 97 C 452 88, 447 86, 439 90" 
            fill="none" 
            stroke="#ffffff" 
            strokeWidth="17" 
            strokeLinecap="round" 
          />
        </g>

        {/* 5. 'pet care' text in friendly rounded green font */}
        <g id="text-pet-care">
          <text 
            x="315" 
            y="202" 
            textAnchor="middle" 
            fill="#429e37" 
            fontSize="36" 
            fontWeight="900" 
            fontFamily="'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
            letterSpacing="0.04em"
          >
            pet care
          </text>
        </g>
      </svg>
    </div>
  );
};
