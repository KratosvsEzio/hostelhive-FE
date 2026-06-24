import type { Meta, StoryObj } from '@storybook/angular';
import { Input } from './input';

const meta: Meta<Input> = {
  component: Input,
  title: 'Input',
};
export default meta;

type Story = StoryObj<Input>;

export const Primary: Story = {
  args: {},
};
