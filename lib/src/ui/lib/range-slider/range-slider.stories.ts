import type { Meta, StoryObj } from '@storybook/angular';
import { RangeSlider } from './range-slider';

const meta: Meta<RangeSlider> = {
  component: RangeSlider,
  title: 'RangeSlider',
};
export default meta;

type Story = StoryObj<RangeSlider>;

export const Primary: Story = {
  args: {},
};
