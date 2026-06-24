import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { Button } from './button';

const meta: Meta<Button> = {
  title: 'Atoms/Button',
  component: Button,
  decorators: [moduleMetadata({ imports: [Button] })],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'primary',
        'secondary',
        'dark',
        'ghost',
        'success',
        'destructive',
      ],
    },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<Button>;

export const Playground: Story = {
  args: { variant: 'primary', size: 'md', disabled: false, loading: false },
  render: (args) => ({
    props: args,
    template: `<button hh-button [variant]="variant" [size]="size" [disabled]="disabled" [loading]="loading">Save changes</button>`,
  }),
};

export const Variants: Story = {
  render: () => ({
    template: `<div class="flex flex-wrap items-center gap-3">
      <button hh-button variant="primary">Primary</button>
      <button hh-button variant="secondary">Secondary</button>
      <button hh-button variant="dark">Dark</button>
      <button hh-button variant="ghost">Ghost</button>
      <button hh-button variant="success">Success</button>
      <button hh-button variant="destructive">Destructive</button>
      <button hh-button [disabled]="true">Disabled</button>
      <button hh-button [loading]="true">Saving…</button>
    </div>`,
  }),
};
