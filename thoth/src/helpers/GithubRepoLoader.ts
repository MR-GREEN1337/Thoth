import { GithubRepoLoader } from "@langchain/community/document_loaders/web/github";
import { Document } from "langchain/document";

interface LoaderOptions {
  branch?: string;
  maxConcurrency?: number;
  ignorePaths?: string[];
  maxFileSize?: number;
  auth?: { token: string };
}

export class EnhancedGithubLoader {
  private loader: GithubRepoLoader | null = null;
  private readonly repoUrl: string;
  private readonly options: Required<LoaderOptions>;
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000;

  constructor(repoUrl: string, options: LoaderOptions = {}) {
    if (!this.isValidGithubUrl(repoUrl)) {
      throw new Error("Invalid GitHub URL format");
    }

    this.repoUrl = repoUrl;
    
    // Initialize options with defaults
    this.options = {
      branch: options.branch || "main",
      maxConcurrency: options.maxConcurrency || 3,
      ignorePaths: [
        ...(options.ignorePaths || []),
        "*.md",
        "*.json",
        "*.git*",
        "node_modules*",
      ],
      maxFileSize: options.maxFileSize || 1024 * 1024, // 1MB
      auth: options.auth || this.getDefaultAuth() || { token: '' }
    };

    this.initializeLoader();
  }

  private getDefaultAuth() {
    const token = process.env.GITHUB_TOKEN;
    return token ? { token } : undefined;
  }

  private isValidGithubUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname === "github.com" && 
             parsedUrl.pathname.split("/").filter(Boolean).length >= 2;
    } catch {
      return false;
    }
  }

  private initializeLoader(): void {
    try {
      this.loader = new GithubRepoLoader(this.repoUrl, {
        branch: this.options.branch,
        maxConcurrency: this.options.maxConcurrency,
        ignorePaths: this.options.ignorePaths,
        accessToken: this.options.auth.token
      });
    } catch (error) {
      console.error(`Failed to initialize loader for ${this.repoUrl}:`, error);
      throw new Error(`Failed to initialize GitHub loader: ${error}`);
    }
  }

  private async tryLoadingBranch(branch: string): Promise<Document[] | null> {
    for (let attempt = 1; attempt <= EnhancedGithubLoader.MAX_RETRIES; attempt++) {
      try {
        const branchLoader = new GithubRepoLoader(this.repoUrl, {
          ...this.options,
          branch
        });
        return await branchLoader.load();
      } catch (error) {
        console.warn(`Attempt ${attempt} failed for branch ${branch}:`, error);
        
        if (attempt < EnhancedGithubLoader.MAX_RETRIES) {
          await new Promise(resolve => 
            setTimeout(resolve, EnhancedGithubLoader.RETRY_DELAY * attempt)
          );
        }
      }
    }
    return null;
  }

  async load(): Promise<Document[]> {
    if (!this.loader) {
      throw new Error("Loader not initialized");
    }

    try {
      // Try configured branch first
      let docs = await this.tryLoadingBranch(this.options.branch);

      // If primary branch fails, try alternate branches
      if (!docs) {
        for (const branch of ["main", "master"]) {
          if (branch !== this.options.branch) {
            docs = await this.tryLoadingBranch(branch);
            if (docs) break;
          }
        }
      }

      if (!docs) {
        throw new Error(`Failed to load repository from all attempted branches`);
      }

      return docs.map(doc => {
        const content = doc.pageContent.length > this.options.maxFileSize
          ? doc.pageContent.slice(0, this.options.maxFileSize) + "\n... (truncated)"
          : doc.pageContent;
          
        return new Document({
          pageContent: content,
          metadata: {
            ...doc.metadata,
            truncated: content.length < doc.pageContent.length
          }
        });
      });

    } catch (error) {
      console.error(`Error loading repo ${this.repoUrl}:`, error);
      throw error;
    }
  }
}