import type { Meta, StoryObj } from '@storybook/angular';
import { Toggle } from './toggle';

const meta: Meta<Toggle> = {
  component: Toggle,
  title: 'Toggle',
};
export default meta;

type Story = StoryObj<Toggle>;

export const Primary: Story = {
  args: {},
};
