export default function VersionBadge() {
  const commit = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "dev";
  return (
    <div className="fixed bottom-2 right-2 z-50 text-[10px] text-gray-400 font-mono select-text cursor-text">
      {commit}
    </div>
  );
}
