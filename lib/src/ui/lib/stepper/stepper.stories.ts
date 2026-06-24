import type { Meta, StoryObj } from '@storybook/angular';
import { Stepper } from './stepper';

const meta: Meta<Stepper> = {
  component: Stepper,
  title: 'Stepper',
};
export default meta;

type Story = StoryObj<Stepper>;

export const Primary: Story = {
  args: {},
};
