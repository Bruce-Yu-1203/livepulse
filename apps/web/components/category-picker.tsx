'use client';

import { roomCategories, type RoomCategory } from '@livepulse/contracts';

import { CategoryIcon } from './category-icon';

export function CategoryPicker({
  disabled,
  hint,
  onChange,
  value,
}: {
  disabled: boolean;
  hint?: string;
  onChange(value: RoomCategory): void;
  value: RoomCategory;
}) {
  return (
    <fieldset className="category-picker" disabled={disabled}>
      <legend className="text-sm font-medium text-fg-soft">Category</legend>
      <div className="category-picker-grid">
        {roomCategories.map((category) => (
          <label
            className="category-option"
            data-selected={category.slug === value}
            key={category.slug}
          >
            <input
              checked={category.slug === value}
              className="sr-only"
              name="room-category"
              onChange={() => onChange(category.slug)}
              type="radio"
              value={category.slug}
            />
            <CategoryIcon category={category.slug} />
            <span>{category.name}</span>
          </label>
        ))}
      </div>
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </fieldset>
  );
}
