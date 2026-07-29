import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { Input } from './input';

const meta: Meta<Input> = {
  title: 'Atoms/Input',
  component: Input,
  decorators: [moduleMetadata({ imports: [Input] })],
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    type: {
      control: 'select',
      options: ['text', 'email', 'number', 'password'],
    },
    disabled: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<Input>;

const template = `<hh-input
  class="max-w-sm"
  [label]="label"
  [icon]="icon"
  [type]="type"
  [placeholder]="placeholder"
  [disabled]="disabled"
  [error]="error"
  [size]="size"
  [autocomplete]="autocomplete"
/>`;

export const Default: Story = {
  args: {
    label: 'Email',
    icon: 'ti-mail',
    type: 'email',
    placeholder: 'you@example.com',
    disabled: false,
    error: '',
    size: 'md',
    autocomplete: 'email',
  },
  render: (args) => ({ props: args, template }),
};

export const Password: Story = {
  args: {
    ...Default.args,
    label: 'Password',
    icon: 'ti-lock',
    type: 'password',
    placeholder: 'Enter your password',
    autocomplete: 'current-password',
  },
  render: (args) => ({ props: args, template }),
};

export const WithError: Story = {
  args: {
    ...Password.args,
    error: 'Passwords do not match.',
  },
  render: (args) => ({ props: args, template }),
};

export const Disabled: Story = {
  args: {
    ...Password.args,
    disabled: true,
  },
  render: (args) => ({ props: args, template }),
};

export const Sizes: Story = {
  render: () => ({
    template: `<div class="flex max-w-sm flex-col gap-4">
      <hh-input size="sm" label="Small" type="password" placeholder="Password" />
      <hh-input size="md" label="Medium" type="password" placeholder="Password" />
      <hh-input size="lg" label="Large" type="password" placeholder="Password" />
    </div>`,
  }),
};
