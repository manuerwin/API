import { Request } from 'express';
import * as uuid from 'uuid';
import BaseService from './baseService';
import BookmarksModel, { IBookmarks, IBookmarksModel } from './bookmarksModel';
import Config from './config';
import { NewSyncsForbiddenException, NewSyncsLimitExceededException, UnspecifiedException } from './exception';
import NewSyncLogsService from './newSyncLogsService';
import Server, { LogLevel } from './server';

// Interface for create bookmarks operation response object
export interface ICreateBookmarksResponse {
  id?: string,
  lastUpdated?: Date
}

// Interface for get bookmarks operation response object
export interface IGetBookmarksResponse {
  bookmarks?: string,
  lastUpdated?: Date
}

// Interface for get bookmarks last updated date operation response object
export interface IGetLastUpdatedResponse {
  lastUpdated?: Date
}

// Interface for update bookmarks operation response object
export interface IUpdateBookmarksResponse {
  lastUpdated?: Date
}

// Implementation of data service for bookmarks operations
export default class BookmarksService extends BaseService<NewSyncLogsService> {
  // Creates a new bookmarks sync with the supplied bookmarks data
  // Returns a new sync ID and last updated date
  public async createBookmarks(bookmarksData: string, req: Request): Promise<ICreateBookmarksResponse> {
    // Before proceeding, check service is available
    Server.checkServiceAvailability();

    // Check service is accepting new syncs
    const isAcceptingNewSyncs = await this.isAcceptingNewSyncs();
    if (!isAcceptingNewSyncs) {
      throw new NewSyncsForbiddenException();
    }

    // Check if daily new syncs limit has been hit if config value enabled
    if (Config.get().dailyNewSyncsLimit > 0) {
      const newSyncsLimitHit = await this.service.newSyncsLimitHit(req);
      if (newSyncsLimitHit) {
        throw new NewSyncsLimitExceededException();
      }
    }

    try {
      // Get a new sync id
      const id = this.newSyncId();

      // Create new bookmarks payload
      const newBookmarks: IBookmarks = {
        _id: id,
        bookmarks: bookmarksData
      };
      const bookmarksModel = new BookmarksModel(newBookmarks);

      // Commit the bookmarks payload to the db
      const savedBookmarks = await bookmarksModel.save();

      // Add to logs
      if (Config.get().dailyNewSyncsLimit > 0) {
        await this.service.createLog(req);
      }
      this.log(LogLevel.Info, 'New bookmarks sync created', req);

      // Return the response data
      const returnObj: ICreateBookmarksResponse = {
        id,
        lastUpdated: savedBookmarks.lastUpdated
      };
      return returnObj;
    }
    catch (err) {
      this.log(LogLevel.Error, 'Exception occurred in BookmarksService.createBookmarks', req, err);
      throw err;
    }
  }

  // Retrieves an existing bookmarks sync using the supplied sync ID
  // Returns the corresponding bookmarks data and last updated date
  public async getBookmarks(id: string, req: Request): Promise<IGetBookmarksResponse> {
    // Before proceeding, check service is available
    Server.checkServiceAvailability();

    try {
      // Query the db for the existing bookmarks data and update the last accessed date
      const updatedBookmarks = await BookmarksModel.findOneAndUpdate(
        { _id: id },
        { lastAccessed: new Date() },
        { new: true }
      ).exec();

      // Return the existing bookmarks data if found 
      const response: IGetBookmarksResponse = {};
      if (updatedBookmarks) {
        response.bookmarks = updatedBookmarks.bookmarks;
        response.lastUpdated = updatedBookmarks.lastUpdated;
      }
      return response;
    }
    catch (err) {
      this.log(LogLevel.Error, 'Exception occurred in BookmarksService.getBookmarks', req, err);
      throw err;
    }
  }

  // Returns the last updated date for the supplied sync ID
  public async getLastUpdated(id: string, req: Request): Promise<IGetLastUpdatedResponse> {
    // Before proceeding, check service is available
    Server.checkServiceAvailability();

    try {
      // Query the db for the existing bookmarks data and update the last accessed date
      const updatedBookmarks = await BookmarksModel.findOneAndUpdate(
        { _id: id },
        { lastAccessed: new Date() },
        { new: true }
      );

      // Return the last updated date if bookmarks data found 
      const response: IGetLastUpdatedResponse = {};
      if (updatedBookmarks) {
        response.lastUpdated = updatedBookmarks.lastUpdated;
      }
      return response;
    }
    catch (err) {
      this.log(LogLevel.Error, 'Exception occurred in BookmarksService.getLastUpdated', req, err);
      throw err;
    }
  }

  // Returns true/false depending whether the service is currently accepting new syncs
  public async isAcceptingNewSyncs(): Promise<boolean> {
    // Check if allowNewSyncs config value enabled
    if (!Config.get().status.allowNewSyncs) {
      return false;
    }

    // Check if maxSyncs config value disabled
    if (Config.get().maxSyncs === 0) {
      return true;
    }

    // Check if total syncs have reached limit set in config  
    const bookmarksCount = await this.getBookmarksCount();
    return bookmarksCount < Config.get().maxSyncs;
  }

  // Updates an existing bookmarks sync corresponding to the supplied sync ID with the supplied bookmarks data
  // Returns the last updated date
  public async updateBookmarks(id: string, bookmarksData: string, req: Request): Promise<IUpdateBookmarksResponse> {
    // Before proceeding, check service is available
    Server.checkServiceAvailability();

    try {
      // Update the bookmarks data corresponding to the sync id in the db
      const now = new Date();
      const updatedBookmarks = await BookmarksModel.findOneAndUpdate(
        { _id: id },
        {
          bookmarks: bookmarksData,
          lastAccessed: now,
          lastUpdated: now
        },
        { new: true }
      ).exec();

      // Return the last updated date if bookmarks data found and updated
      const response: IGetLastUpdatedResponse = {};
      if (updatedBookmarks) {
        response.lastUpdated = updatedBookmarks.lastUpdated;
      }

      return response;
    }
    catch (err) {
      this.log(LogLevel.Error, 'Exception occurred in BookmarksService.createBookmarks', req, err);
      throw err;
    }
  }

  // Returns the total number of existing bookmarks syncs
  private async getBookmarksCount(): Promise<number> {
    let bookmarksCount = -1;

    try {
      bookmarksCount = await BookmarksModel.count({}).exec();
    }
    catch (err) {
      this.log(LogLevel.Error, 'Exception occurred in BookmarksService.getBookmarksCount', null, err);
      throw err;
    }

    // Ensure a valid count was returned
    if (bookmarksCount < 0) {
      const err = new UnspecifiedException('Bookmarks count cannot be less than zero');
      this.log(LogLevel.Error, 'Exception occurred in NewSyncLogsService.newSyncsLimitHit', null, err);
      throw err;
    }

    return bookmarksCount;
  }

  // Generates a new 32 char id string
  private newSyncId(): string {
    let newId: string;

    try {
      // Create a new v4 uuid and return as an unbroken string to use for a unique id
      const bytes: any = uuid.v4(null, new Buffer(16));
      newId = new Buffer(bytes, 'base64').toString('hex');
    }
    catch (err) {
      this.log(LogLevel.Error, 'Exception occurred in BookmarksService.newSyncId', null, err);
      throw err;
    }

    return newId;
  }
}