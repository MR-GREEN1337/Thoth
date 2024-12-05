import { AccordionItem, AccordionTrigger,AccordionContent } from "@/components/ui/accordion";
import { Link } from "lucide-react";

const SourcesSection = ({ urls }: {urls: String[]}) => {
  if (!urls || urls.length === 0) return null;

  return (
    <AccordionItem value="sources" className="border-gray-700">
      <AccordionTrigger className="text-white hover:text-blue-400">
        Sources
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-2 pt-2">
          <ul className="space-y-2">
            {urls.map((url, index) => (
              <li key={index} className="flex items-center space-x-2">
                <Link className="h-4 w-4 text-blue-400" />
                <a
                  href={url as any}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 truncate"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export default SourcesSection;