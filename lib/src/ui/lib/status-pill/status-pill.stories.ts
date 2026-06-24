import type { Meta, StoryObj } from '@storybook/angular';
import { StatusPill } from './status-pill';

const meta: Meta<StatusPill> = {
  component: StatusPill,
  title: 'StatusPill',
};
export default meta;

type Story = StoryObj<StatusPill>;

export const Primary: Story = {
  args: {},
};
