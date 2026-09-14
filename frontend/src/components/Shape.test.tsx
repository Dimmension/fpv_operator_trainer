import { render, screen } from "@testing-library/react";

import { Shape } from "./Shape";
import { SHAPE_LABELS } from "./shapeTypes";

describe("Shape", () => {
  it.each(Object.keys(SHAPE_LABELS) as Array<keyof typeof SHAPE_LABELS>)(
    "renders %s as an svg",
    (shape) => {
      const { container } = render(
        <span aria-label={SHAPE_LABELS[shape]}>
          <Shape shape={shape} />
        </span>,
      );
      expect(screen.getByLabelText(SHAPE_LABELS[shape])).toBeInTheDocument();
      expect(container.querySelector("svg")).toBeInTheDocument();
    },
  );
});
