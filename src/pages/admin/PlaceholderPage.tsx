interface PlaceholderPageProps {
  title: string;
  description?: string;
}

function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <section className="admin-placeholder-card">
      <span className="admin-status">功能建设中</span>
      <h2>{title}</h2>
    </section>
  );
}

export default PlaceholderPage;
