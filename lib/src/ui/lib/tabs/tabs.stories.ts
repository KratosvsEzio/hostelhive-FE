import type { Meta, StoryObj } from '@storybook/angular';
import { Tabs } from './tabs';

const meta: Meta<Tabs> = {
  component: Tabs,
  title: 'Tabs',
};
export default meta;

type Story = StoryObj<Tabs>;

export const Primary: Story = {
  args: {},
};
