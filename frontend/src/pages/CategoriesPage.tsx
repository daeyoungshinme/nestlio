import CategoriesSection from "@/components/categories/CategoriesSection";

export default function CategoriesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">카테고리 관리</h1>
      <CategoriesSection />
    </div>
  );
}
