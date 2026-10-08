import { BOARD_TOPICS } from '../game/ranking.ts';
import { TOPIC_LABEL, type Topic } from '../game/topics.ts';

/** Countries / Flags / Capitals, for the boards and Your games. */
export function TopicTabs({ topic, onPick }: { topic: Topic; onPick: (topic: Topic) => void }) {
  return (
    <div className="seg topic-tabs" role="tablist" aria-label="Topic">
      {BOARD_TOPICS.map((t) => (
        <button key={t} type="button" role="tab" aria-selected={t === topic} className={t === topic ? 'on' : ''} onClick={() => onPick(t)}>
          {TOPIC_LABEL[t]}
        </button>
      ))}
    </div>
  );
}
