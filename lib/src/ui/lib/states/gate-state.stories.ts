import type { Meta, StoryObj } from '@storybook/angular';
import { GateState } from './gate-state';

const meta: Meta<GateState> = {
  component: GateState,
  title: 'GateState',
};
export default meta;

type Story = StoryObj<GateState>;

export const Primary: Story = {
  args: {},
};
