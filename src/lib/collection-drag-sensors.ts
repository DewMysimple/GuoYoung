import { MouseSensor, TouchSensor } from "@dnd-kit/core";

export const GROUP_SORT_ACTIVATION_DISTANCE = 8;
export const SITE_DRAG_ACTIVATION_DISTANCE = 50;
export class CollectionMouseSensor extends MouseSensor {
  constructor(props: ConstructorParameters<typeof MouseSensor>[0]) {
    const target = props.event.target;
    const groupSortGesture =
      target instanceof Element && Boolean(target.closest("[data-group-sort-handle]"));
    super({
      ...props,
      options: {
        ...props.options,
        activationConstraint: {
          distance: groupSortGesture
            ? GROUP_SORT_ACTIVATION_DISTANCE
            : SITE_DRAG_ACTIVATION_DISTANCE,
        },
      },
    });
  }
}

export class CollectionTouchSensor extends TouchSensor {
  constructor(props: ConstructorParameters<typeof TouchSensor>[0]) {
    const target = props.event.target;
    const groupSortGesture =
      target instanceof Element && Boolean(target.closest("[data-group-sort-handle]"));
    super({
      ...props,
      options: {
        ...props.options,
        activationConstraint: {
          distance: groupSortGesture
            ? GROUP_SORT_ACTIVATION_DISTANCE
            : SITE_DRAG_ACTIVATION_DISTANCE,
        },
      },
    });
  }
}
