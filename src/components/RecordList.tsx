export function RecordList({ title, items, empty = "None" }: { title: string; items: string[]; empty?: string }) {
  return (
    <section className="record-block">
      <h3>
        {title}
        <span>{items.length}</span>
      </h3>
      {items.length ? (
        <ul className="record-list">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="record-empty">{empty}</p>
      )}
    </section>
  );
}
