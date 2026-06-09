import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getTeam } from "../data";

const POS_LABEL = ["1st", "2nd", "3rd", "4th"];

function Row({ id, index, disabled }: { id: string; index: number; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const team = getTeam(id);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const tier = index < 2 ? "adv" : index === 2 ? "third" : "out";
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={"gs-row tier-" + tier + (disabled ? " is-locked" : "")}
      {...attributes}
      {...listeners}
    >
      <span className="gs-pos">{POS_LABEL[index]}</span>
      <span className="gs-flag">{team.flag}</span>
      <span className="gs-name">{team.name}</span>
      {!disabled && <span className="gs-grip" aria-hidden>⠿</span>}
    </li>
  );
}

export function GroupSorter({
  group,
  order,
  onChange,
  onReset,
  disabled,
}: {
  group: string;
  order: string[];
  onChange: (next: string[]) => void;
  onReset: () => void;
  disabled: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onChange(arrayMove(order, from, to));
  };

  return (
    <section className="gs-card">
      <header className="gs-head">
        <h3 className="gs-title">Group {group}</h3>
        {!disabled && (
          <button className="gs-reset" onClick={onReset} title="Reset to standings order">
            ↺ Reset
          </button>
        )}
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol className="gs-list">
            {order.map((id, i) => (
              <Row key={id} id={id} index={i} disabled={disabled} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  );
}
